import { createFileRoute } from '@tanstack/react-router';
import { OutputsPage } from '@/components/danfe/outputs';
export const Route = createFileRoute('/saidas')({
  component: OutputsPage,
  head: () => ({ meta: [
    { title: 'Arquivos gerados | DANFE Workspace' },
    { name: 'description', content: 'Organize e encontre os documentos PDF e XML das suas consultas DANFE.' },
    { property: 'og:title', content: 'Arquivos gerados | DANFE Workspace' },
    { property: 'og:description', content: 'Gerenciador de documentos fiscais PDF e XML.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
});