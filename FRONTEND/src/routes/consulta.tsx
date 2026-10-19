import { createFileRoute } from '@tanstack/react-router';
import { QuickQueryPage } from '@/components/danfe/quick-query';
export const Route = createFileRoute('/consulta')({
  component: QuickQueryPage,
  head: () => ({ meta: [
    { title: 'Consulta rápida | DANFE Workspace' },
    { name: 'description', content: 'Consulte uma NF-e pela chave de 44 dígitos e salve PDF e XML.' },
    { property: 'og:title', content: 'Consulta rápida | DANFE Workspace' },
    { property: 'og:description', content: 'Consulta unitária de notas fiscais por chave de acesso.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
});