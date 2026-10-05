const { getConnector } = require('../connectors');
const { compileTransforms } = require('./transforms');
const { abortError } = require('../lib/util');

/**
 * Execute one pipeline run: extract in batches from the source, apply
 * transforms, and load into the destination. Progress is reported after
 * every batch; the AbortSignal is checked between batches.
 */
async function executeRun({ run, pipeline, source, dest, dataDir, signal, log, progress }) {
  const sourceConnector = getConnector(source.type);
  const destConnector = getConnector(dest.type);
  const sourceCtx = { dataDir, connectionId: source.id, signal };
  const destCtx = { dataDir, connectionId: dest.id };
  const batchSize = Math.max(1, Number(pipeline.batchSize) || 500);
  const counters = { rowsRead: 0, rowsWritten: 0, rowsFiltered: 0, batches: 0, rowsTotal: null };

  log('info', `Attempt ${run.attempt} of ${run.maxAttempts}: extracting "${pipeline.sourceStream}" from ${source.name} (${sourceConnector.label})`);

  if (sourceConnector.count) {
    try {
      counters.rowsTotal = await sourceConnector.count(source.config, pipeline.sourceStream, sourceCtx);
      log('info', `Source reports ${counters.rowsTotal.toLocaleString('en-US')} rows`);
      progress({ ...counters });
    } catch (err) {
      log('warn', `Could not estimate row count: ${err.message}`);
    }
  }

  const apply = compileTransforms(pipeline.transforms);
  if (pipeline.transforms.length) log('info', `Applying ${pipeline.transforms.length} transform step(s): ${pipeline.transforms.map((t) => t.type).join(' → ')}`);

  const writer = await destConnector.openWriter(dest.config, pipeline.destTarget, {
    mode: pipeline.writeMode, upsertKey: pipeline.upsertKey, ctx: destCtx, runId: run.id,
  });
  log('info', `Loading into "${pipeline.destTarget}" on ${dest.name} (${destConnector.label}, ${pipeline.writeMode})`);

  try {
    for await (const batch of sourceConnector.read(source.config, pipeline.sourceStream, { batchSize, signal, ctx: sourceCtx, attempt: run.attempt })) {
      if (signal.aborted) throw abortError();
      const { rows, filtered } = apply(batch);
      const written = await writer.write(rows);
      counters.rowsRead += batch.length;
      counters.rowsFiltered += filtered;
      counters.rowsWritten += written;
      counters.batches += 1;
      progress({ ...counters });
    }
    if (signal.aborted) throw abortError();
    await writer.commit();
  } catch (err) {
    await writer.abort?.();
    throw err;
  }

  log('info', `Loaded ${counters.rowsWritten.toLocaleString('en-US')} rows in ${counters.batches} batch(es); ${counters.rowsFiltered.toLocaleString('en-US')} filtered out`);
  return counters;
}

module.exports = { executeRun };
