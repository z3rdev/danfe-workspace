<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Keep the simulated desktop session in the shared DANFE provider so batch progress, outputs, logs and theme survive client-side navigation without a backend.
- Keep each workspace view as its own TanStack leaf route and share Windows-style chrome in the root shell for consistent navigation.
- Keep invoice parsing and key validation in the browser-safe DANFE domain module so simulation rules are testable independently of the UI.
