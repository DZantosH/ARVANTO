package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.IOException;

/** Android exposes result callback constructors only within android.print. */
public final class ArvantoPdfWriter {
  public interface Listener { void complete(); void failed(String message); }
  public static void write(PrintDocumentAdapter adapter, File target, Listener listener) {
    PrintAttributes attributes = new PrintAttributes.Builder()
      .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
      .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 300, 300))
      .setMinMargins(PrintAttributes.Margins.NO_MARGINS).build();
    adapter.onStart();
    adapter.onLayout(null, attributes, new CancellationSignal(), new PrintDocumentAdapter.LayoutResultCallback() {
      @Override public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
        try {
          ParcelFileDescriptor descriptor = ParcelFileDescriptor.open(target,
            ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_READ_WRITE | ParcelFileDescriptor.MODE_TRUNCATE);
          adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, descriptor, new CancellationSignal(), new PrintDocumentAdapter.WriteResultCallback() {
            private void close() { try { descriptor.close(); } catch (IOException ignored) {} adapter.onFinish(); }
            @Override public void onWriteFinished(PageRange[] pages) { close(); listener.complete(); }
            @Override public void onWriteFailed(CharSequence error) { close(); target.delete(); listener.failed(error == null ? "No se pudo escribir el PDF." : error.toString()); }
            @Override public void onWriteCancelled() { onWriteFailed("Exportación cancelada."); }
          });
        } catch (IOException error) { adapter.onFinish(); listener.failed(error.getMessage()); }
      }
      @Override public void onLayoutFailed(CharSequence error) { adapter.onFinish(); listener.failed(error == null ? "No se pudo generar el PDF." : error.toString()); }
      @Override public void onLayoutCancelled() { onLayoutFailed("Exportación cancelada."); }
    }, null);
  }
}
