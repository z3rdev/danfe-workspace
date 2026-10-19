import { createFileRoute } from '@tanstack/react-router';
import { DevelopmentReleasePage } from '@/components/danfe/development-release';

export const Route = createFileRoute('/desenvolvimento')({
  component: DevelopmentReleasePage,
  head: () => ({ meta: [{ title: 'Publicar versão | DANFE Workspace' }] }),
});
