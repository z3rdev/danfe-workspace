# DANFE Workspace — API local

> Backend em **Node.js + Express** responsável pela comunicação com os serviços de consulta fiscal, processamento de NF-e, geração e organização de arquivos, automações e integrações locais do DANFE Workspace.

**Plataforma:** Windows · **Ambiente:** local · **Porta instalada:** `3000` · **Porta de desenvolvimento:** `3001`

## Índice

- [Visão geral](#visão-geral)
- [Executar o backend](#executar-o-backend)
- [Desenvolvimento com o aplicativo instalado](#desenvolvimento-com-o-aplicativo-instalado)
- [Configuração](#configuração)
- [Referência da API](#referência-da-api)
- [Consulta e conversão de documentos](#consulta-e-conversão-de-documentos)
- [Integração com rede e SQL Server](#integração-com-rede-e-sql-server)
- [Arquivos e histórico](#arquivos-e-histórico)
- [Processamento em lote](#processamento-em-lote)
- [Publicação de releases em desenvolvimento](#publicação-de-releases-em-desenvolvimento)
- [Exemplos de uso](#exemplos-de-uso)
- [Segurança e distribuição](#segurança-e-distribuição)

## Visão geral

A API atua como intermediária entre a interface do DANFE Workspace e os serviços externos configurados. Ela também disponibiliza operações locais para consultar e salvar DANFEs, gerar layouts a partir de XML, acompanhar a conectividade da rede e do SQL Server e consultar o histórico persistente.

| Recurso | Responsabilidade |
| --- | --- |
| **Proxy fiscal** | Encaminhar consultas e devolver respostas e cabeçalhos úteis da API de consulta. |
| **Consulta e salvamento** | Consultar chaves NF-e, baixar PDFs e armazenar arquivos auxiliares. |
| **Layouts por XML** | Gerar DANFE Simplificado, Etiqueta e Cupom Varejo a partir do XML já salvo. |
| **Lotes** | Interpretar entradas em texto, processar sequencialmente, aplicar pausas e permitir interrupção. |
| **Histórico** | Persistir registros no SQLite e evitar downloads repetidos quando os arquivos já existem. |
| **Rede e banco** | Acompanhar o host configurado e o estado da integração com SQL Server. |
| **Releases de desenvolvimento** | Publicar e listar versões por um painel habilitado explicitamente. |

> [!NOTE]
> A interface, o histórico e os arquivos gerados ficam no ambiente local. **Consultas fiscais e conversões de XML dependem dos serviços externos configurados**; o SQL Server depende da conectividade com a rede da operação.

## Executar o backend

### Iniciar pelo atalho

Na pasta `BACKEND`, execute o atalho localizado no diretório superior:

```text
..\INICIAR_SERVIDOR.bat
```

### Iniciar pelo terminal

No diretório `BACKEND`:

```powershell
npm install --no-audit --fund=false
npm start
```

Por padrão, o aplicativo instalado utiliza:

```text
http://localhost:3000
```

Na instalação Windows, a execução em segundo plano é gerenciada pelo serviço:

| Propriedade | Valor |
| --- | --- |
| Nome interno | `APIDANFEBACKEND` |
| Nome exibido | `API DANFE Backend` |

## Desenvolvimento com o aplicativo instalado

A instalação e o ambiente de desenvolvimento podem funcionar simultaneamente, em portas diferentes.

| Ambiente | Serviço | Porta | Observação |
| --- | --- | --- | --- |
| **Instalado** | Backend do serviço Windows | `3000` | Mantém seus próprios arquivos e configurações. |
| **Desenvolvimento** | `npm run dev` em `BACKEND` | `3001` | Lê `BACKEND/.env`. |
| **Interface de desenvolvimento** | `pnpm dev` em `FRONTEND` | Configurada no Vite | Encaminha `/api` e `/arquivos` ao backend de desenvolvimento. |

Na raiz do projeto, abra terminais separados:

**Terminal 1 — API:**

```powershell
cd BACKEND
npm run dev
```

**Terminal 2 — interface:**

```powershell
cd FRONTEND
pnpm dev
```

Para abrir a interface no aplicativo nativo, utilize o comando Tauri em `DESKTOP`, conforme a configuração desse projeto:

```powershell
cd DESKTOP
pnpm dlx @tauri-apps/cli dev
```

O backend lê `BACKEND/.env` deste projeto. No modo de desenvolvimento, alterações nesse arquivo reiniciam a API automaticamente. Para alterar a porta de desenvolvimento, configure `DANFE_DEV_PORT` no ambiente **dos dois terminais**.

## Configuração

As variáveis utilizadas dependem das integrações habilitadas. Consulte o arquivo de exemplo do projeto, quando disponível, antes de executar a API.

| Variável ou configuração | Finalidade |
| --- | --- |
| `DANFE_DEV_PORT` | Alterar a porta da API em desenvolvimento. |
| `MEUDANFE_API_KEY` | Autenticação para conversões de XML no MeuDanfe. |
| `NETWORK_PROBE_HOST` | Host monitorado pela verificação de rede; padrão: `127.0.0.1`. |
| `DANFE_DATA_DIR` | Diretório de estado e histórico do backend. |
| `BATCH_INTERVAL_MS` | Intervalo utilizado no processamento dos lotes. |
| `BATCH_SIZE` | Quantidade de itens por bloco de processamento. |
| `BATCH_PAUSE_MS` | Pausa entre blocos de processamento. |
| `BACKEND/CONFIG.dev` | Habilita recursos locais de publicação quando contém `DEVMODE=TRUE`. |
| `BACKEND/credentials.json` | Credenciais de publicação utilizadas exclusivamente pelo backend. |

As credenciais de acesso ao SQL Server ficam no `BACKEND/.env`; configure-as conforme os parâmetros aceitos pelo projeto.

## Referência da API

**Endereço-base instalado:** `http://localhost:3000`

### Estado, configurações e integrações

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/api/health` | Verifica o estado da API. |
| `GET` | `/api/microservico/rede/status` | Retorna o estado da rede monitorada. |
| `GET` | `/api/microservico/banco/status` | Retorna o estado da integração com SQL Server. |
| `GET` | `/api/microservico/banco/notas` | Consulta as notas da tabela `NFEIDIST` no período configurado pela implementação. |
| `GET` | `/api/microservico/config` | Consulta a configuração local. |
| `POST` | `/api/microservico/config` | Atualiza a pasta de saída. |
| `GET` | `/api/microservico/automacao` | Consulta o estado da automação. |

Corpo de `POST /api/microservico/config`:

```json
{
  "outputDir": "C:\\caminho\\saida"
}
```

### Arquivos, histórico e processamento

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/api/microservico/arquivos` | Lista os arquivos gerados. |
| `GET` | `/api/microservico/processados` | Consulta o histórico de processamentos. |
| `DELETE` | `/api/microservico/processados` | Limpa o histórico de processamentos. |
| `POST` | `/api/microservico/consulta-salvar` | Consulta uma chave e salva o DANFE. |
| `POST` | `/api/microservico/arquivos/layout` | Gera um layout adicional a partir do XML armazenado. |
| `POST` | `/api/microservico/parse-texto` | Interpreta a entrada textual. |
| `POST` | `/api/microservico/processar-texto` | Inicia um processamento por texto. |
| `POST` | `/api/microservico/interromper` | Solicita a interrupção do lote em andamento. |

Exemplo de corpo para consultar e salvar:

```json
{
  "chave": "SUA_CHAVE_NFE_DE_44_DIGITOS",
  "numero": "000000537",
  "nome": "Empresa Exemplo"
}
```

Exemplo de geração de layout:

```json
{
  "chave": "SUA_CHAVE_NFE_DE_44_DIGITOS",
  "layout": "simplificado"
}
```

Valores aceitos para `layout`: `simplificado`, `etiqueta` ou `varejo`.

Exemplo de processamento de texto:

```json
{
  "texto": "...",
  "somenteSelecionadas": true
}
```

### Consulta fiscal e conversão de XML

| Método | Endpoint | Entrada |
| --- | --- | --- |
| `POST` | `/api/consulta` | JSON com `chave` e `format: "json"`. |
| `POST` | `/api/consulta` | JSON com `chave` e `format: "pdf"`. |
| `POST` | `/api/danfe` | `multipart/form-data` com campo `xml`. |
| `POST` | `/api/danfe/etiqueta` | `multipart/form-data` com campo `xml`. |
| `POST` | `/api/danfe/simplificado` | `multipart/form-data` com campo `xml`. |
| `POST` | `/api/danfe/etiqueta-html` | `multipart/form-data` com campo repetível `xml`. |

A API repassa cabeçalhos relevantes fornecidos pelos serviços externos, incluindo `X-Error-Code`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` e `Retry-After`.

### Endpoints de releases (somente em desenvolvimento)

| Método | Endpoint | Descrição |
| --- | --- | --- |
| `GET` | `/api/dev/release/status` | Consulta o estado das releases. |
| `POST` | `/api/dev/release/publish` | Publica a versão por `multipart/form-data`. |

O endpoint de publicação recebe `version`, `notes`, `installer` e `signature`.

> [!IMPORTANT]
> Esses endpoints são disponibilizados somente quando o modo indicado por `CONFIG.dev` está ativo. Não distribua uma instalação com essa configuração habilitada sem avaliar os riscos e controles de acesso do ambiente.

## Consulta e conversão de documentos

A geração dos layouts adicionais utiliza o **XML já salvo localmente** e os endpoints de conversão do MeuDanfe:

| Layout | Endpoint externo |
| --- | --- |
| DANFE Simplificado | `POST /v2/fd/convert/xml-to-simplified` |
| DANFE Etiqueta | `POST /v2/fd/convert/xml-to-label` |
| DANFE Cupom Varejo | `POST /v2/fd/convert/xml-to-retail` |

O XML completo é enviado no corpo da requisição. `MEUDANFE_API_KEY` é utilizada para autenticação.

No endpoint local `POST /api/microservico/arquivos/layout`, a chave informada serve **apenas para localizar o XML no armazenamento local**. Se ele não existir, a operação informa um erro e **não tenta buscar o documento por uma consulta paga**.

Segundo a [documentação oficial do MeuDanfe](https://meudanfe.com.br/documentacao), essas três conversões são gratuitas. A busca de uma NF-e nova por `/fd/add/{Chave-Acesso}` é um serviço distinto, não utilizado na geração desses layouts.

## Integração com rede e SQL Server

Antes de executar consultas, o backend verifica o host definido em `NETWORK_PROBE_HOST`. O valor padrão é `127.0.0.1`; para acompanhar a rede da operação, configure um host representativo da infraestrutura.

O SQL Server é monitorado em segundo plano, com estado disponível em:

```http
GET /api/microservico/banco/status
```

A consulta em `/api/microservico/banco/notas` utiliza a tabela `NFEIDIST`, com filtros para `SITUAC_VR = 0`, ciência e confirmação da operação. O campo `DEMI` abrange o intervalo entre **um mês atrás e o final do dia atual**.

As credenciais do SQL Server permanecem no arquivo local `BACKEND/.env`.

## Arquivos e histórico

### Pasta de saída

O endpoint `POST /api/microservico/consulta-salvar` consulta a chave, baixa o PDF e grava o resultado na pasta configurada. O destino padrão é:

```text
%USERPROFILE%\Documents\DANFE
```

Os PDFs seguem o padrão `<numero> - <nome>.pdf`. A organização dos arquivos é:

```text
DANFE/
├── PDF/
│   └── 000000537 - Empresa Exemplo.pdf
├── .JSON/
│   └── 000000537 - Empresa Exemplo.json
├── .XML/
│   └── 000000537 - Empresa Exemplo.xml
└── .LAYOUTS/
    ├── simplificado/
    │   └── 000000537 - Empresa Exemplo - DANFE Simplificado.pdf
    ├── etiqueta/
    │   └── 000000537 - Empresa Exemplo - DANFE Etiqueta.pdf
    └── varejo/
        └── 000000537 - Empresa Exemplo - DANFE Cupom Varejo.pdf
```

- `.JSON`, `.XML` e `.LAYOUTS` são marcadas como **ocultas no Windows**.
- O JSON contém a resposta enxuta da API, sem armazenar o PDF em base64.
- O XML é salvo quando a API retorna `xml_base64`.
- Layouts adicionais antigos presentes em `PDF` são movidos automaticamente para `.LAYOUTS` na inicialização do backend, preservando o vínculo com o DANFE principal.

### Download e visualização

No aplicativo nativo, a ação **Baixar** no menu de layouts ou no visualizador cria uma cópia na pasta **Downloads** do usuário. Quando já existe um arquivo com o mesmo nome, a cópia recebe `(1)`, `(2)` e assim por diante, sem substituir a anterior.

Na versão aberta pelo navegador, o download segue as preferências do próprio navegador.

### Histórico persistente

O histórico é mantido no arquivo `danfe.sqlite`, sob a pasta definida em `DANFE_DATA_DIR`. O arquivo `processados.json` permanece disponível para compatibilidade.

| Ambiente | Diretório de dados |
| --- | --- |
| Desenvolvimento (exemplo) | `DADOS` |
| Instalação Windows (padrão) | `%PROGRAMDATA%\DANFE Workspace\data` |

Se uma chave já tiver PDF e JSON registrados no histórico, a API a marca como `ja_processado` e evita um novo download.

Para zerar o histórico, utilize:

```http
DELETE /api/microservico/processados
```

A operação também está disponível no botão **Limpar log** da interface.

## Processamento em lote

Os lotes são executados de maneira **sequencial**, em blocos automáticos. O backend aplica pausas entre os blocos, respeita respostas de limitação temporária da API e tenta novamente requisições afetadas por instabilidades passageiras.

| Variável | Ajuste |
| --- | --- |
| `BATCH_INTERVAL_MS` | Intervalo do processamento. |
| `BATCH_SIZE` | Tamanho de cada bloco. |
| `BATCH_PAUSE_MS` | Pausa entre blocos. |

Para interromper um lote em execução, utilize `POST /api/microservico/interromper` ou o botão **Interromper** no frontend.

## Publicação de releases em desenvolvimento

Crie o arquivo `BACKEND/CONFIG.dev` com o conteúdo:

```ini
DEVMODE=TRUE
```

Com o backend iniciado nesse modo, a interface disponibiliza **Publicar versão**. Esse painel permite enviar o instalador NSIS, sua assinatura `.sig` e as notas de versão para a pasta `danfe-workspace` do bucket de releases, além de listar as versões existentes.

As credenciais de publicação ficam em `BACKEND/credentials.json` e são utilizadas **somente pelo backend**; não são enviadas ao navegador.

> [!WARNING]
> O script `Prepare-InstallerResources.ps1` copia `CONFIG.dev` quando o arquivo existe. **Revise essa configuração antes de distribuir o instalador**, para não incluir recursos de desenvolvimento por engano.

## Exemplos de uso

Os exemplos abaixo utilizam o backend instalado na porta `3000`.

### Verificar a saúde da API

```powershell
curl.exe http://localhost:3000/api/health
```

### Consultar e salvar uma NF-e

```powershell
$body = @{
    chave  = 'SUA_CHAVE_NFE_DE_44_DIGITOS'
    numero = '000000537'
    nome   = 'Empresa Exemplo'
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri 'http://localhost:3000/api/microservico/consulta-salvar' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $body
```

### Gerar um layout a partir do XML local

```powershell
$body = @{
    chave  = 'SUA_CHAVE_NFE_DE_44_DIGITOS'
    layout = 'simplificado'
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri 'http://localhost:3000/api/microservico/arquivos/layout' `
    -Method Post `
    -ContentType 'application/json' `
    -Body $body
```

### Interromper um lote

```powershell
Invoke-RestMethod `
    -Uri 'http://localhost:3000/api/microservico/interromper' `
    -Method Post
```

## Segurança e distribuição

- Mantenha `BACKEND/.env`, `BACKEND/credentials.json`, chaves de API e senhas **fora do controle de versão**.
- Não inclua `CONFIG.dev` com `DEVMODE=TRUE` em um instalador destinado ao uso normal sem revisar a exposição dos endpoints de release.
- Restrinja o acesso à API local conforme o ambiente de implantação; o fato de um serviço usar `localhost` não substitui autenticação ou verificações de permissão quando necessárias.
- Valide a configuração dos caminhos de saída e o acesso ao SQL Server antes de disponibilizar o aplicativo a outros usuários.

---

**DANFE Workspace** · Backend local para consulta, processamento e organização de documentos fiscais.
