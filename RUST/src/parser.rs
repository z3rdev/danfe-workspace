use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ParseRequest {
    #[serde(alias = "texto")]
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct ParseResponse {
    pub ok: bool,
    pub total: usize,
    pub validas: usize,
    pub selecionadas: usize,
    pub linhas: Vec<NotaRow>,
}

#[derive(Debug, Serialize)]
pub struct NotaRow {
    pub linha: usize,
    pub selecionado: Option<bool>,
    pub numero: String,
    pub chave: String,
    pub nome: String,
    pub uf: String,
    pub valor: String,
    pub emissao: String,
    pub situacao: String,
    pub valida: bool,
    pub erros: Vec<String>,
}

pub fn parse_notas_text(text: &str) -> ParseResponse {
    let linhas: Vec<NotaRow> = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .enumerate()
        .map(|(index, line)| parse_line(line, index + 1))
        .collect();

    ParseResponse {
        ok: true,
        total: linhas.len(),
        validas: linhas.iter().filter(|row| row.valida).count(),
        selecionadas: linhas
            .iter()
            .filter(|row| row.valida && row.selecionado == Some(true))
            .count(),
        linhas,
    }
}

fn parse_line(line: &str, line_number: usize) -> NotaRow {
    let tokens: Vec<&str> = if line.contains('\t') {
        line.split('\t').map(str::trim).collect()
    } else if line.contains(';') {
        line.split(';').map(str::trim).collect()
    } else {
        line.split_whitespace().collect()
    };

    let key_index = tokens
        .iter()
        .position(|token| normalize_key(token).len() == 44);
    let chave = key_index
        .map(|index| normalize_key(tokens[index]))
        .unwrap_or_default();
    let selecionado = key_index.and_then(|index| {
        tokens[..index]
            .iter()
            .rev()
            .find_map(|token| parse_bool(token))
    });
    let numero = key_index
        .and_then(|index| {
            tokens[..index]
                .iter()
                .rev()
                .find(|token| is_number(token, 12))
                .map(|token| zero_pad(token, 9))
        })
        .unwrap_or_else(|| {
            if chave.len() == 44 {
                chave[25..34].to_string()
            } else {
                String::new()
            }
        });

    let tail = key_index.map(|index| &tokens[index + 1..]).unwrap_or(&[]);
    let valor = tail
        .iter()
        .find(|token| looks_like_money(token))
        .map(|token| (*token).to_string())
        .unwrap_or_default();
    let uf = tail
        .iter()
        .find(|token| is_uf(token))
        .map(|token| token.to_uppercase())
        .unwrap_or_default();
    let nome = extract_name(tail, &uf);

    let mut erros = Vec::new();
    if chave.len() != 44 {
        erros.push("Chave invalida ou ausente.".to_string());
    }
    if nome.is_empty() && !chave.is_empty() {
        erros.push("Nome nao identificado automaticamente.".to_string());
    }

    NotaRow {
        linha: line_number,
        selecionado,
        numero,
        chave,
        nome,
        uf,
        valor,
        emissao: String::new(),
        situacao: String::new(),
        valida: erros.is_empty(),
        erros,
    }
}

fn normalize_key(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .map(|character| character.to_ascii_uppercase())
        .collect()
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "sim" | "s" | "1" | "x" | "ok" => Some(true),
        "false" | "nao" | "não" | "n" | "0" => Some(false),
        _ => None,
    }
}

fn is_number(value: &str, max_digits: usize) -> bool {
    let digits = value.chars().filter(char::is_ascii_digit).count();
    digits > 0 && digits <= max_digits && value.chars().all(|character| character.is_ascii_digit())
}

fn zero_pad(value: &str, width: usize) -> String {
    format!("{:0>width$}", value, width = width)
}

fn looks_like_money(value: &str) -> bool {
    let trimmed = value.trim().replace('.', "").replace(',', ".");
    trimmed.parse::<f64>().is_ok() && value.contains([',', '.'])
}

fn is_uf(value: &str) -> bool {
    value.len() == 2
        && value
            .chars()
            .all(|character| character.is_ascii_alphabetic())
}

fn extract_name(tokens: &[&str], uf: &str) -> String {
    if tokens.is_empty() {
        return String::new();
    }

    let uf_index = if uf.is_empty() {
        tokens.len()
    } else {
        tokens
            .iter()
            .position(|token| token.eq_ignore_ascii_case(uf))
            .unwrap_or(tokens.len())
    };

    let mut name_tokens: Vec<&str> = tokens[..uf_index]
        .iter()
        .copied()
        .filter(|token| !is_number(token, 14) && !looks_like_money(token))
        .collect();

    while name_tokens.last().is_some_and(|token| is_number(token, 14)) {
        name_tokens.pop();
    }

    name_tokens.join(" ")
}

#[cfg(test)]
mod tests {
    use super::parse_notas_text;

    #[test]
    fn parses_report_line_with_key_and_number() {
        let text = "True 000000537 23261003202767000191550060000005371535307961 Confirmada AUTO POSTO JATIENSE LTDA 062864254 CE 3207,60";
        let result = parse_notas_text(text);

        assert_eq!(result.total, 1);
        assert_eq!(result.validas, 1);
        assert_eq!(result.selecionadas, 1);
        assert_eq!(result.linhas[0].numero, "000000537");
        assert_eq!(result.linhas[0].chave.len(), 44);
    }

    #[test]
    fn marks_missing_key_as_invalid() {
        let result = parse_notas_text("linha sem chave");

        assert_eq!(result.validas, 0);
        assert!(!result.linhas[0].erros.is_empty());
    }
}
