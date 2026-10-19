use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

pub fn save_pdf(source: &Path, downloads: &Path) -> Result<PathBuf, String> {
    if !source.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("pdf")) {
        return Err("Somente arquivos PDF podem ser baixados.".to_string());
    }
    let mut input = File::open(source).map_err(|error| format!("Nao foi possivel ler o PDF: {error}"))?;
    let mut header = [0_u8; 5];
    input.read_exact(&mut header).map_err(|_| "O arquivo nao e um PDF valido.".to_string())?;
    if &header != b"%PDF-" {
        return Err("O arquivo nao e um PDF valido.".to_string());
    }
    input.seek(SeekFrom::Start(0)).map_err(|error| error.to_string())?;
    fs::create_dir_all(downloads).map_err(|error| format!("Nao foi possivel abrir Downloads: {error}"))?;
    let stem = source.file_stem().ok_or("Nome de arquivo invalido.")?.to_string_lossy();

    for index in 0..10000 {
        let name = if index == 0 { format!("{stem}.pdf") } else { format!("{stem} ({index}).pdf") };
        let target = downloads.join(name);
        let mut output = match OpenOptions::new().write(true).create_new(true).open(&target) {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("Nao foi possivel salvar em Downloads: {error}")),
        };
        if let Err(error) = std::io::copy(&mut input, &mut output) {
            drop(output);
            let _ = fs::remove_file(&target);
            return Err(format!("Nao foi possivel copiar o PDF: {error}"));
        }
        return Ok(target);
    }
    Err("Nao foi possivel escolher um nome disponivel em Downloads.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn workspace() -> PathBuf {
        let suffix = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("danfe-download-test-{}-{suffix}", std::process::id()));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn copies_pdf_and_keeps_source_and_existing_downloads() {
        let root = workspace();
        let source = root.join("DANFE Etiqueta.pdf");
        let downloads = root.join("Downloads");
        let pdf = b"%PDF-1.4\nPDF de teste";
        fs::write(&source, pdf).unwrap();
        let first = save_pdf(&source, &downloads).unwrap();
        let second = save_pdf(&source, &downloads).unwrap();
        assert_eq!(first.file_name().unwrap(), "DANFE Etiqueta.pdf");
        assert_eq!(second.file_name().unwrap(), "DANFE Etiqueta (1).pdf");
        assert_eq!(fs::read(&source).unwrap(), pdf);
        assert_eq!(fs::read(&first).unwrap(), pdf);
        assert_eq!(fs::read(&second).unwrap(), pdf);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_pdf_before_creating_download() {
        let root = workspace();
        let source = root.join("arquivo.pdf");
        let downloads = root.join("Downloads");
        fs::write(&source, b"nao e um PDF").unwrap();
        assert!(save_pdf(&source, &downloads).is_err());
        assert!(!downloads.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
