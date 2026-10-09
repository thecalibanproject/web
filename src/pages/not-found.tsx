import { Link } from '@tanstack/react-router';
import { EmptyState } from '@/components/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="That address does not match any console page."
      action={
        <Link to="/" className="text-accent underline underline-offset-2">
          Go to overview
        </Link>
      }
    />
  );
}
