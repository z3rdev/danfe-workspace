# API DANFE Rust

Primeiro nucleo Rust do microsservico local. Nesta etapa ele oferece health check e leitura do texto de notas no mesmo formato usado pelo front.

## Executar

```powershell
cd API-DANFE\RUST
cargo run
```

Tambem existe uma copia executavel pronta na pasta `API-DANFE\RUST\api-danfe-rust.exe`. Ao abrir o arquivo, mantenha o processo em execucao e acesse `http://127.0.0.1:3030/` no navegador para confirmar que o servico esta online.

Esse executavel e um servico, portanto ele nao abre uma tela do sistema sozinho. A tela de acompanhamento continua no frontend em `http://127.0.0.1:3000/`.

Endpoints:

- `GET http://127.0.0.1:3030/api/health`
- `POST http://127.0.0.1:3030/api/microservico/parse-texto`
- `POST http://127.0.0.1:3030/api/parse-texto`

Exemplo de corpo:

```json
{
  "texto": "True 000000537 SUA_CHAVE_NFE_DE_44_DIGITOS Confirmada Empresa Exemplo CE 3207,60"
}
```

O Rust ainda fica como servico paralelo. O backend Node continua sendo o responsavel por consulta externa, salvamento, deduplicacao, lotes e SSE ate a migracao dessas partes ser validada.
