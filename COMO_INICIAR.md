# Como iniciar o server

## Opcao mais simples

Abra o arquivo:

```text
API-DANFE\INICIAR_SERVIDOR.bat
```

Ele instala/valida as ferramentas, registra o backend como servico nativo do Windows e inicia em segundo plano em:

```text
http://localhost:3000
```

## Pelo terminal

```powershell
cd ".\BACKEND"
npm install --no-audit --fund=false
npm start
```

## Parar o server

Na janela onde o server esta rodando:

```text
Ctrl+C
```

Ou, se ele estiver em segundo plano, encontre o PID pela porta:

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

E pare:

```powershell
Stop-Process -Id <PID>
```

## Instalar para iniciar com o Windows

Use o instalador:

```text
API-DANFE\INSTALAR_SERVICOS.bat
```

Antes de criar a inicializacao, ele valida Node.js e npm. Se Node.js/npm nao forem encontrados, usa o instalador local:

```text
API-DANFE\SERVICOS\node.msi
```

Depois ele executa `npm install` no backend quando as dependencias ainda nao existem.

O backend e instalado pelo WinSW como o servico `APIDANFEBACKEND`, exibido no Windows como `API DANFE Backend`. O servico inicia com o Windows, reinicia se falhar e nao abre janela de console.

O instalador cria uma tarefa no Agendador do Windows para o painel:

- `API-DANFE-FRONT`: abre o painel em `http://localhost:3000` quando a API estiver pronta.

Se o Windows negar acesso ao Agendador, o instalador usa automaticamente a pasta `Inicializar` do usuario como alternativa para o painel:

```text
API-DANFE\SERVICOS\START_FRONT_HIDDEN.vbs
```

Para forcar a instalacao pelo Agendador com permissao de administrador, execute:

```text
API-DANFE\INSTALAR_SERVICOS_ADMIN.bat
```

Esse instalador abre a janela `API DANFE - Instalacao`, que mostra as etapas e as mensagens do processo. O CMD/PowerShell usado internamente permanece oculto para nao abrir uma tela preta.

Para instalar somente as dependencias, sem mexer na inicializacao do Windows:

```text
API-DANFE\INSTALAR_DEPENDENCIAS.bat
```

Para instalar somente o Node.js pelo MSI incluido no projeto:

```text
API-DANFE\INSTALAR_NODE.bat
```

O front nao precisa de um servidor separado, porque o proprio backend ja entrega a pasta `FRONTEND`.

Arquivos uteis:

```text
API-DANFE\STATUS_SERVICOS.bat   Verifica tarefas, API e porta 3000
API-DANFE\PARAR_SERVICOS.bat    Para o backend que esta rodando agora
API-DANFE\REMOVER_SERVICOS.bat  Remove a inicializacao automatica
```

Logs dos servicos:

```text
API-DANFE\LOGS\backend-control.log
API-DANFE\LOGS\backend-control.err.log
API-DANFE\LOGS\backend-install.log
API-DANFE\LOGS\native-service-install.log
API-DANFE\LOGS\native-service\
API-DANFE\LOGS\installer-ui.log
```

## Gerar pacote instalavel

Para criar um ZIP limpo para instalar em outra maquina, execute:

```text
API-DANFE\COMPILAR_INSTALADOR.bat
```

O pacote sera criado em:

```text
API-DANFE\DIST
```

Esse pacote nao inclui `node_modules`, PDFs, XMLs, JSONs nem logs. Ao instalar em outra maquina, o proprio inicializador usa `node.msi` quando necessario e roda `npm install`.

## Funcionalidade de leitura do TXT

A tela aceita texto tabulado como:

```text
True    000000748    SUA_CHAVE_NFE_DE_44_DIGITOS    Ciencia    ...    JC DELIVERY LTDA
```

Campos usados:

- primeira coluna: `True` ou `False`
- `Nota`: numero usado no nome do PDF
- `Chave Nfe`: chave de acesso consultada
- `Nome`: nome usado no arquivo

Por padrao, o lote processa somente linhas marcadas como `True`.

Em lotes grandes, o sistema consulta uma nota por vez, separa automaticamente as notas em blocos, faz pausas entre os blocos e repete consultas quando a API sinaliza um limite temporario. Notas ja salvas no log sao puladas.

## Saida e log de processados

Na tela de configuracoes, voce pode alterar a pasta padrao de saida. Em uma instalacao nativa, os dados ficam em uma pasta local do Windows e o servico recria os caminhos conforme o usuario e o computador.

Em desenvolvimento, a configuracao fica salva em:

```text
..\DADOS\config.json
```

Cada consulta salva o PDF e tambem um JSON da resposta. Se a API retornar XML, ele sera salvo junto. A saida fica separada assim:

```text
<pasta escolhida>\PDF
<pasta escolhida>\.XML
<pasta escolhida>\.JSON
```

As pastas `.XML` e `.JSON` sao criadas com atributo oculto no Windows. O usuario trabalha com a pasta `PDF`, e o sistema continua lendo os dados ocultos quando precisar.

O log das chaves ja baixadas fica em uma pasta local do Windows na instalacao nativa. Em desenvolvimento, ele fica em:

```text
..\DADOS\processados.json
```

Quando o mesmo texto ou arquivo for enviado de novo, chaves ja registradas nesse log nao serao baixadas novamente. O botao `Limpar log` apaga somente esse historico, sem apagar os PDFs, XMLs ou JSONs salvos.

Durante um lote, o botao `Interromper` solicita a parada da automacao. O item atual pode terminar, mas o backend para antes de seguir para as proximas notas.

## Extensao do navegador

No instalador, a extensao e copiada automaticamente para:

```text
%LOCALAPPDATA%\DANFE Workspace\BrowserExtension
```

Ao terminar a instalacao, o DANFE abre a tela de extensoes do navegador padrao:

```text
chrome://extensions
```

Ative `Modo do desenvolvedor`, clique em `Carregar sem compactacao` e selecione a pasta copiada. O Chrome e o Edge exigem esse ultimo clique para extensoes locais nao publicadas; depois disso o icone DANFE aparece na barra do navegador.

Quando encontrar chave NF-e em um texto copiado dentro do navegador, ela abre uma janela pedindo confirmacao antes de enviar. Para textos copiados fora do navegador, abra o popup da extensao e use `Enviar clipboard`.
