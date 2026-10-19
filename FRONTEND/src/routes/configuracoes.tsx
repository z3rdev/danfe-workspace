import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/components/danfe/settings';

export const Route = createFileRoute('/configuracoes')({
  component: SettingsPage,
  head: () => ({ meta: [
    { title: 'Configurações | DANFE Workspace' },
    { name: 'description', content: 'Configure inicialização, pastas e processamento do DANFE Workspace.' },
  ] }),
});
