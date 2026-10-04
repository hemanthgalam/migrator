import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState } from '../components/ui';

export default function NotFound() {
  return (
    <Card>
      <EmptyState icon={<Compass className="size-5" />} title="Page not found" description="That page does not exist or was removed." action={<Link to="/"><Button>Back to overview</Button></Link>} />
    </Card>
  );
}
