import { createFileRoute } from "@tanstack/react-router";
import { BatchPage } from '@/components/danfe/batch';
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'Processamento em lote | DANFE Workspace' },
    { name: 'description', content: 'Importe notas fiscais e acompanhe consultas em lote com o DANFE Workspace.' },
    { property: 'og:title', content: 'Processamento em lote | DANFE Workspace' },
    { property: 'og:description', content: 'Importe notas fiscais e acompanhe consultas em lote.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: BatchPage,
});
