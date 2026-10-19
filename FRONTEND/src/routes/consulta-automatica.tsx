import { createFileRoute } from '@tanstack/react-router';
import { AutomaticQueryPage } from '@/components/danfe/automatic-query';

export const Route = createFileRoute('/consulta-automatica')({
  component: AutomaticQueryPage,
});
