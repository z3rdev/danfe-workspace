import { createFileRoute } from '@tanstack/react-router';
import { LogsPage } from '@/components/danfe/logs';
export const Route = createFileRoute('/logs')({
  component: LogsPage,
  head: () => ({ meta: [
    { title: 'Terminal de logs | DANFE Workspace' },
    { name: 'description', content: 'Acompanhe eventos, avisos e erros do microsserviço DANFE.' },
    { property: 'og:title', content: 'Terminal de logs | DANFE Workspace' },
    { property: 'og:description', content: 'Atividade em tempo real do microsserviço de consultas.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
});