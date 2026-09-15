/**
 * Salin teks ke clipboard dengan fallback `execCommand` untuk secure-context
 * gagal / Clipboard API tak tersedia. Dipisah ke modul agar bisa di-mock di
 * test komponen (stub `navigator.clipboard` global terbukti rapuh di jsdom).
 *
 * Melempar bila semua jalur gagal agar caller bisa memberi umpan balik jujur
 * (jangan tampilkan "disalin" padahal gagal).
 */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (mainError) {
    const execCommand = (
      document as Document & { execCommand?: (command: string) => boolean }
    ).execCommand;
    if (typeof execCommand !== 'function') throw mainError;
    // Fallback lama: textarea sementara + execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      execCommand.call(document, 'copy');
    } finally {
      document.body.removeChild(ta);
    }
  }
}
