# Extensao DANFE Captura Local

Esta extensao reconhece texto copiado com chaves NF-e e envia a captura para o DANFE Workspace local em `http://localhost:3000`.

## Como funciona

- Em paginas abertas no navegador, ao copiar um texto que contenha chave NF-e de 44 caracteres, o DANFE Workspace recebe a captura e abre a confirmacao dentro do aplicativo nativo.
- Ao confirmar no aplicativo, o texto segue para `/api/microservico/processar-texto`.
- Se o texto vier de outro programa, use o botao `Enviar clipboard` no popup da extensao; a confirmacao tambem aparece no aplicativo nativo.
- O backend continua decidindo o que ja foi processado pelo log `API-DANFE/DADOS/processados.json`, entao nota repetida nao baixa de novo.
- O botao `Interromper` para o lote em andamento no microservico.

## Instalação pelo DANFE Workspace

O instalador do DANFE Workspace copia a extensão automaticamente para:

```text
%LOCALAPPDATA%\DANFE Workspace\BrowserExtension
```

Ao finalizar a instalação, ele abre a tela de extensões do navegador padrão para concluir o carregamento da pasta.

O Chrome e o Edge não permitem que um instalador comum carregue silenciosamente uma extensão descompactada. Para instalação sem esse último clique, a extensão precisa ser publicada na loja do navegador ou distribuída por uma política corporativa.

## Instalar manualmente no Chrome, Edge ou Brave

1. Abra `chrome://extensions` ou `edge://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione a pasta:

```text
%LOCALAPPDATA%\DANFE Workspace\BrowserExtension
```

## Instalar no Firefox

1. Abra `about:debugging#/runtime/this-firefox`.
2. Clique em `Carregar extensao temporaria`.
3. Selecione o arquivo:

```text
API-DANFE\EXTENSAO\manifest.json
```

Depois de alterar os arquivos da extensao, clique em `Recarregar` na pagina de extensoes do navegador.

## Limites importantes

- Nenhuma extensao consegue capturar copia feita dentro de paginas internas do navegador, como `chrome://` ou `edge://`.
- Copias feitas em programas fora do navegador nao disparam o modo automatico. Para esses casos, clique na extensao e use `Enviar clipboard`.
- A extensao so envia texto que contenha chave NF-e; outros textos copiados sao ignorados.
