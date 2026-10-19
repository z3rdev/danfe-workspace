# DANFE Workspace Desktop

Aplicativo nativo em Rust/Tauri. Ele abre o frontend compilado dentro de uma janela própria, sem depender de Edge ou Chrome.

O backend local precisa estar ativo em `http://127.0.0.1:3000`.

## Gerar executavel

Na pasta `API-DANFE/DESKTOP`, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\Build-Desktop.ps1
```

O arquivo pronto sera gerado em `API-DANFE/DESKTOP/DANFE-Workspace.exe`.

## Gerar uma nova release

O script `Release-Next.ps1` incrementa automaticamente a versão `patch`, sincroniza `tauri.conf.json` e `Cargo.toml` e gera o instalador NSIS com a assinatura do updater:

```powershell
cd DESKTOP
.\Release-Next.ps1
```

Para publicar automaticamente no backend local, use:

```powershell
.\Release-Next.ps1 -Publish -Notes "Correções e melhorias desta versão."
```

Também é possível gerar uma versão `minor`, `major` ou informar uma versão exata:

```powershell
.\Release-Next.ps1 -Part minor
.\Release-Next.ps1 -Part major
.\Release-Next.ps1 -Version 1.0.0 -Publish -Notes "Primeira versão estável."
```

Os arquivos `.exe` e `.sig` ficam em `src-tauri\target\release\bundle\nsis`.
