# API DANFE - Backend local

Backend Express que faz proxy seguro para a API publica do Consulta DANFE e serve o front local.

## Rodar

Pelo atalho:

```text
..\INICIAR_SERVIDOR.bat
```

Ou pelo terminal:

```bash
npm install --no-audit --fund=false
npm start
```

Para manter o backend em segundo plano, o instalador usa um servico nativo do Windows chamado `APIDANFEBACKEND`, exibido como `API DANFE Backend`.

Abra:

```text
http://localhost:3000
```

## Desenvolvimento com o aplicativo instalado

Execute `npm run dev` em `BACKEND` e `pnpm dev` em `FRONTEND` (ou `pnpm dlx @tauri-apps/cli dev` em `DESKTOP`). O backend de desenvolvimento usa a porta `3001` e o Vite encaminha `/api` e `/arquivos` para essa porta. O servico instalado continua na porta `3000`, com seus proprios arquivos e configuracoes.

O backend le sempre `BACKEND/.env` deste projeto. No modo de desenvolvimento, alteracoes nesse arquivo reiniciam o backend automaticamente. Para usar outra porta de desenvolvimento, defina `DANFE_DEV_PORT` no ambiente dos dois terminais.

Os layouts adicionais usam o envio do XML local aos endpoints gratuitos do MeuDanfe:

- `POST /v2/fd/convert/xml-to-simplified`
- `POST /v2/fd/convert/xml-to-label`
- `POST /v2/fd/convert/xml-to-retail`

O XML completo vai no corpo da requisicao. `MEUDANFE_API_KEY` continua obrigatoria somente para autenticacao. A chave de acesso enviada ao endpoint local `/api/microservico/arquivos/layout` serve para localizar o XML salvo; nao faz uma busca externa por chave. Se o XML nao estiver salvo, a geracao retorna erro e nao tenta uma consulta paga.

A [documentacao oficial do MeuDanfe](https://meudanfe.com.br/documentacao) identifica essas tres conversoes como gratuitas. A busca de uma NF-e nova via `/fd/add/{Chave-Acesso}` e um servico diferente e nao e usado na geracao de layouts.

## Painel de releases em desenvolvimento

O arquivo `BACKEND/CONFIG.dev` com o conteudo abaixo habilita o painel local de publicacao:

```text
DEVMODE=TRUE
```

Com o backend iniciado nesse modo, aparece a tela `Publicar versao`. Ela envia o instalador NSIS, a assinatura `.sig` e as notas para a pasta `danfe-workspace` do bucket de releases e lista as versoes existentes. O painel usa `BACKEND/credentials.json` somente no backend; as credenciais nunca sao enviadas ao navegador.

O script `Prepare-InstallerResources.ps1` copia `CONFIG.dev` quando ele existe. Revise essa configuracao antes de distribuir o instalador.

## Endpoints locais

- `GET /api/health`
- `GET /api/dev/release/status` (somente com `CONFIG.dev` ativo)
- `POST /api/dev/release/publish` com `multipart/form-data` nos campos `version`, `notes`, `installer` e `signature` (somente com `CONFIG.dev` ativo)
- `GET /api/microservico/rede/status`
- `GET /api/microservico/banco/status`
- `GET /api/microservico/banco/notas` consulta as notas da tabela `NFEIDIST` do ultimo mes ate hoje
- `GET /api/microservico/config`
- `POST /api/microservico/config` com JSON `{ "outputDir": "C:\\caminho\\saida" }`
- `GET /api/microservico/arquivos`
- `GET /api/microservico/processados`
- `DELETE /api/microservico/processados`
- `GET /api/microservico/automacao`
- `POST /api/microservico/interromper`
- `POST /api/microservico/consulta-salvar` com JSON `{ "chave": "...", "numero": "000000537", "nome": "Empresa Exemplo" }`
- `POST /api/microservico/arquivos/layout` com JSON `{ "chave": "...", "layout": "simplificado|etiqueta|varejo" }` gera outro PDF a partir do XML salvo
- `POST /api/microservico/parse-texto` com JSON `{ "texto": "..." }`
- `POST /api/microservico/processar-texto` com JSON `{ "texto": "...", "somenteSelecionadas": true }`
- `POST /api/consulta` com JSON `{ "chave": "...", "format": "json" }`
- `POST /api/consulta` com JSON `{ "chave": "...", "format": "pdf" }`
- `POST /api/danfe` com `multipart/form-data`, campo `xml`
- `POST /api/danfe/etiqueta` com `multipart/form-data`, campo `xml`
- `POST /api/danfe/simplificado` com `multipart/form-data`, campo `xml`
- `POST /api/danfe/etiqueta-html` com `multipart/form-data`, campo `xml` repetivel

O backend repassa headers uteis como `X-Error-Code`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `Retry-After`.

## Microservico de rede e banco

Antes das consultas, o backend verifica o host configurado em `NETWORK_PROBE_HOST` (por padrao `127.0.0.1`). Configure o host da sua rede para monitorar a conectividade da operacao. O SQL Server e monitorado em segundo plano e o status fica disponivel em `/api/microservico/banco/status`.

O endpoint `/api/microservico/banco/notas` executa a consulta filtrando `SITUAC_VR = 0`, ciencia e confirmacao de operacao, com `DEMI` entre um mes atras e o fim do dia atual. As credenciais ficam somente no arquivo local `BACKEND/.env`.

## Microservico de consulta e salvamento

O endpoint `POST /api/microservico/consulta-salvar` consulta a chave, baixa o PDF e salva na pasta configurada. Por padrao:

```text
%USERPROFILE%\Documents\DANFE
```

O nome do arquivo segue o padrao:

```text
<numero> - <nome>.pdf
```

Tambem sao salvos arquivos auxiliares:

```text
PDF/<numero> - <nome>.pdf
.JSON/<numero> - <nome>.json
.XML/<numero> - <nome>.xml
.LAYOUTS/simplificado/<numero> - <nome> - DANFE Simplificado.pdf
.LAYOUTS/etiqueta/<numero> - <nome> - DANFE Etiqueta.pdf
.LAYOUTS/varejo/<numero> - <nome> - DANFE Cupom Varejo.pdf
```

As pastas `.JSON`, `.XML` e `.LAYOUTS` sao marcadas como ocultas no Windows. O JSON sempre e gravado com a resposta enxuta da API, sem o PDF em base64. O XML e gravado quando a API retornar `xml_base64`.

Os layouts extras existentes em `PDF` sao movidos para `.LAYOUTS` automaticamente ao iniciar o backend, mantendo o vinculo com o DANFE principal. No menu de layouts e no visualizador, `Baixar` salva uma copia na pasta Downloads do usuario do aplicativo nativo. Nomes repetidos recebem `(1)`, `(2)` etc., sem substituir o arquivo anterior. No navegador, o PDF e enviado como download de acordo com as preferencias do navegador.

O backend mantem o historico persistente em `danfe.sqlite`, na pasta definida por `DANFE_DATA_DIR`, com um arquivo `processados.json` para compatibilidade. O exemplo de desenvolvimento usa `DADOS`; a instalacao usa por padrao `%PROGRAMDATA%\DANFE Workspace\data`. Se uma chave ja tiver PDF e JSON registrados no historico, ela sera marcada como `ja_processado` e nao sera baixada novamente. Use `DELETE /api/microservico/processados` ou o botao `Limpar log` no front para zerar esse historico.

Para interromper um lote em andamento, use `POST /api/microservico/interromper` ou o botao `Interromper` no front.

Em lotes grandes, o processamento e sequencial e dividido em blocos automaticos. O backend faz pausas entre os blocos, respeita respostas de limite temporario da API e tenta novamente consultas que falharem por instabilidade momentanea. Os parametros podem ser ajustados por ambiente com `BATCH_INTERVAL_MS`, `BATCH_SIZE` e `BATCH_PAUSE_MS`.

Exemplo:

```bash
curl -X POST http://localhost:3000/api/microservico/consulta-salvar \
  -H "Content-Type: application/json" \
  -d "{\"chave\":\"SUA_CHAVE_NFE_DE_44_DIGITOS\",\"numero\":\"000000537\",\"nome\":\"Empresa Exemplo\"}"
```
