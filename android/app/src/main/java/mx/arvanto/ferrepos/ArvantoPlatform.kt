package mx.arvanto.ferrepos

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteCursor
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.*
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

class ArvantoPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(ArvantoPlatform(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}

class ArvantoPlatform(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val worker = Executors.newSingleThreadExecutor()
  private val databases = mutableMapOf<String, SQLiteDatabase>()
  // Preserve the database location used by previously installed versions.
  private val directory = File(context.filesDir, "SQLite").apply { mkdirs() }
  private var picker: Promise? = null
  private val prefs = context.getSharedPreferences("arvanto.secure", 0)
  init {
    context.addActivityEventListener(object : BaseActivityEventListener() {
      override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != 7401) return
        val promise = picker ?: return
        picker = null
        if (resultCode != Activity.RESULT_OK || data?.data == null) {
          promise.resolve(Arguments.createMap().apply { putBoolean("canceled", true); putArray("assets", Arguments.createArray()) }); return
        }
        task(promise) {
          val uri = data.data!!
          var name = "catalogo"; var size = 0L
          context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
              val n = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME); if (n >= 0) name = cursor.getString(n)
              val s = cursor.getColumnIndex(OpenableColumns.SIZE); if (s >= 0) size = cursor.getLong(s)
            }
          }
          require(size <= 64L * 1024 * 1024) { "El archivo supera 64 MB." }
          val output = File(context.cacheDir, "picked-${UUID.randomUUID()}-${name.replace(Regex("[^A-Za-z0-9._-]"), "_")}")
          try {
            context.contentResolver.openInputStream(uri)!!.use { input -> output.outputStream().use { out ->
              val bytes = ByteArray(8192); var total = 0L
              while (true) { val n = input.read(bytes); if (n < 0) break; total += n; require(total <= 64L * 1024 * 1024) { "El archivo supera 64 MB." }; out.write(bytes, 0, n) }
            } }
          } catch (error: Exception) { output.delete(); throw error }
          Arguments.createMap().apply {
            putBoolean("canceled", false)
            putArray("assets", Arguments.createArray().apply { pushMap(Arguments.createMap().apply { putString("uri", output.toURI().toString()); putString("name", name); putDouble("size", output.length().toDouble()) }) })
          }
        }
      }
    })
  }
  override fun getName() = "ArvantoPlatform"
  override fun getConstants(): MutableMap<String, Any> = mutableMapOf("cacheDirectory" to Uri.fromFile(context.cacheDir).toString(), "databaseDirectory" to Uri.fromFile(directory).toString())
  private fun task(promise: Promise, action: () -> Any?) { worker.execute { try { promise.resolve(action()) } catch (error: Exception) { promise.reject("ARVANTO_ERROR", error.message, error) } } }
  private fun file(uri: String): File {
    val path = Uri.parse(uri).path ?: uri
    val file = File(path).canonicalFile
    require(file.path.startsWith(context.filesDir.canonicalPath + "/") || file.path.startsWith(context.cacheDir.canonicalPath + "/")) { "Archivo fuera del almacenamiento de ARVANTO." }
    return file
  }
  private fun dbFile(name: String): File { require(Regex("[A-Za-z0-9._-]+\\.db").matches(name)); return File(directory, name) }
  private fun open(name: String) = SQLiteDatabase.openOrCreateDatabase(dbFile(name), null).apply { execSQL("PRAGMA foreign_keys=ON") }
  private fun db(name: String) = databases[name] ?: throw IllegalStateException("Base cerrada: $name")
  private fun bytes(value: String) = Base64.decode(value, Base64.NO_WRAP)
  private fun encode(value: ByteArray) = Base64.encodeToString(value, Base64.NO_WRAP)
  @ReactMethod(isBlockingSynchronousMethod = true) fun randomUUID(): String = UUID.randomUUID().toString()
  @ReactMethod fun digest(text: String, promise: Promise) = task(promise) { MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) } }
  @ReactMethod fun randomBytes(size: Int, promise: Promise) = task(promise) { require(size in 1..4096); encode(ByteArray(size).also { SecureRandom().nextBytes(it) }) }
  private fun encrypt(data: ByteArray, key: SecretKey): ByteArray { val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key); return cipher.iv + cipher.doFinal(data) }
  private fun decrypt(data: ByteArray, key: SecretKey): ByteArray { require(data.size >= 28); val cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, data.copyOfRange(0, 12))); return cipher.doFinal(data.copyOfRange(12, data.size)) }
  @ReactMethod fun aes(data: String, key: String, decrypt: Boolean, promise: Promise) = task(promise) {
    require(Regex("[0-9a-fA-F]{64}").matches(key))
    val secret = SecretKeySpec(key.chunked(2).map { it.toInt(16).toByte() }.toByteArray(), "AES")
    encode(if (decrypt) decrypt(bytes(data), secret) else encrypt(bytes(data), secret))
  }
  private fun vaultKey(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey("arvanto-vault", null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder("arvanto-vault", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @ReactMethod fun secureGet(key: String, promise: Promise) = task(promise) {
    prefs.getString(key, null)?.let { return@task String(decrypt(bytes(it), vaultKey())) }
    // Read and re-encrypt existing keys during an in-place upgrade. No former runtime is needed.
    val oldPrefs = context.getSharedPreferences("SecureStore", 0)
    val encoded = oldPrefs.getString("key_v1-$key", null) ?: oldPrefs.getString(key, null) ?: return@task null
    val record = JSONObject(encoded)
    require(record.optString("scheme") == "aes" && !record.optBoolean("requireAuthentication")) { "La clave anterior requiere recuperación manual." }
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    val alias = "AES/GCM/NoPadding:key_v1" + if (record.optBoolean("usesKeystoreSuffix")) ":keystoreUnauthenticated" else ""
    val secret = store.getKey(alias, null) as? SecretKey ?: throw IllegalStateException("No se encontró la clave anterior del dispositivo.")
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.DECRYPT_MODE, secret, GCMParameterSpec(record.getInt("tlen"), bytes(record.getString("iv"))))
    val value = String(cipher.doFinal(bytes(record.getString("ct"))))
    check(prefs.edit().putString(key, encode(encrypt(value.toByteArray(), vaultKey()))).commit())
    value
  }
  @ReactMethod fun secureSet(key: String, value: String, promise: Promise) = task(promise) { check(prefs.edit().putString(key, encode(encrypt(value.toByteArray(), vaultKey()))).commit()); null }
  @ReactMethod fun readFile(uri: String, promise: Promise) = task(promise) { val f = file(uri); require(f.length() <= 64L * 1024 * 1024) { "Archivo demasiado grande." }; encode(f.readBytes()) }
  @ReactMethod fun writeFile(uri: String, data: String, promise: Promise) = task(promise) { val f = file(uri); f.parentFile!!.mkdirs(); f.writeBytes(bytes(data)); null }
  @ReactMethod fun openDatabase(name: String, promise: Promise) = task(promise) { if (!databases.containsKey(name)) databases[name] = open(name); name }
  @ReactMethod fun closeDatabase(name: String, promise: Promise) = task(promise) { databases.remove(name)?.close(); null }
  @ReactMethod fun deleteDatabase(name: String, promise: Promise) = task(promise) { databases.remove(name)?.close(); SQLiteDatabase.deleteDatabase(dbFile(name)); null }
  @ReactMethod fun sql(name: String, sql: String, args: ReadableArray, script: Boolean, promise: Promise) = task(promise) {
    val database = db(name); val rows = Arguments.createArray()
    if (script) {
      // SQLite statements can contain trigger bodies; split only outside strings and BEGIN/END triggers.
      for (statement in splitSql(sql)) {
        if (statement.trimStart().startsWith("PRAGMA", true)) database.rawQuery(statement, null).use { while (it.moveToNext()) { /* Execute pragma. */ } }
        else database.execSQL(statement)
      }
    } else if (Regex("^\\s*(SELECT|PRAGMA|WITH)\\b", RegexOption.IGNORE_CASE).containsMatchIn(sql)) {
      database.rawQueryWithFactory({ _, driver, table, query ->
        for (i in 0 until args.size()) when (args.getType(i)) {
          ReadableType.Null -> query.bindNull(i + 1)
          ReadableType.Number -> { val value = args.getDouble(i); if (value == value.toLong().toDouble()) query.bindLong(i + 1, value.toLong()) else query.bindDouble(i + 1, value) }
          else -> query.bindString(i + 1, args.getString(i)!!)
        }
        SQLiteCursor(driver, table, query)
      }, sql, emptyArray(), "").use { cursor ->
        while (cursor.moveToNext()) { val row = Arguments.createMap(); for (i in 0 until cursor.columnCount) { val column = cursor.getColumnName(i); when (cursor.getType(i)) { Cursor.FIELD_TYPE_NULL -> row.putNull(column); Cursor.FIELD_TYPE_INTEGER, Cursor.FIELD_TYPE_FLOAT -> row.putDouble(column, cursor.getDouble(i)); else -> row.putString(column, cursor.getString(i)) } }; rows.pushMap(row) }
      }
    } else {
      database.compileStatement(sql).use { statement ->
        for (i in 0 until args.size()) when (args.getType(i)) { ReadableType.Null -> statement.bindNull(i + 1); ReadableType.Number -> statement.bindDouble(i + 1, args.getDouble(i)); else -> statement.bindString(i + 1, args.getString(i)!!) }
        statement.execute()
      }
    }
    var changes = 0; var lastId = 0.0
    database.rawQuery("SELECT changes(), last_insert_rowid()", null).use { if (it.moveToFirst()) { changes = it.getInt(0); lastId = it.getDouble(1) } }
    Arguments.createMap().apply { putArray("rows", rows); putInt("changes", changes); putDouble("lastInsertRowId", lastId) }
  }
  private fun splitSql(sql: String): List<String> {
    val output = mutableListOf<String>(); var start = 0; var quoted = false; var trigger = false
    var i = 0
    while (i < sql.length) {
      if (sql[i] == '\'') { if (quoted && i + 1 < sql.length && sql[i + 1] == '\'') { i += 2; continue }; quoted = !quoted }
      if (!quoted && sql[i] == ';') {
        val statement = sql.substring(start, i).trim()
        trigger = statement.startsWith("CREATE TRIGGER", true)
        if (!trigger || Regex("END\\s*$", RegexOption.IGNORE_CASE).containsMatchIn(statement)) { if (statement.isNotBlank()) output.add(statement); start = i + 1; trigger = false }
      }
      i++
    }
    sql.substring(start).trim().takeIf { it.isNotEmpty() }?.let { output.add(it) }
    return output
  }
  @ReactMethod fun backupDatabase(source: String, destination: String, promise: Promise) = task(promise) {
    val from = db(source); require(!from.inTransaction())
    from.rawQuery("PRAGMA wal_checkpoint(TRUNCATE)", null).use { require(it.moveToFirst() && it.getInt(0) == 0) { "Base ocupada. Intenta de nuevo." } }
    databases.remove(destination)?.close()
    SQLiteDatabase.deleteDatabase(dbFile(destination))
    dbFile(source).copyTo(dbFile(destination), overwrite = true)
    databases[destination] = open(destination)
    null
  }
  @ReactMethod fun pickFile(types: ReadableArray, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject("NO_ACTIVITY", "Abre la app para elegir un archivo.")
    if (picker != null) return promise.reject("PICKER_BUSY", "Ya hay un selector abierto.")
    picker = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply { addCategory(Intent.CATEGORY_OPENABLE); type = "*/*"; putExtra(Intent.EXTRA_MIME_TYPES, Array(types.size()) { types.getString(it)!! }) }
    activity.runOnUiThread { try { activity.startActivityForResult(intent, 7401) } catch (error: Exception) { picker = null; promise.reject("PICKER", error) } }
  }
  @ReactMethod fun shareFile(uri: String, mime: String, title: String, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject("NO_ACTIVITY", "Abre la app para compartir.")
    try { val content = FileProvider.getUriForFile(context, "${context.packageName}.files", file(uri)); val intent = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, content); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }; activity.startActivity(Intent.createChooser(intent, title)); promise.resolve(null) } catch (error: Exception) { promise.reject("SHARE", error) }
  }
  @ReactMethod fun print(html: String, toFile: Boolean, promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject("NO_ACTIVITY", "Abre la app para imprimir.")
    activity.runOnUiThread {
      val view = WebView(activity)
      view.settings.javaScriptEnabled = false
      view.settings.allowFileAccess = false
      view.settings.blockNetworkLoads = true
      view.webViewClient = object : WebViewClient() {
        var started = false
        override fun onPageFinished(webView: WebView, url: String) {
          if (started) return; started = true
          val delegate = view.createPrintDocumentAdapter("ARVANTO")
          if (!toFile) {
            val wrapper = object : PrintDocumentAdapter() {
              override fun onStart() { delegate.onStart() }
              override fun onLayout(old: PrintAttributes?, new: PrintAttributes, signal: CancellationSignal, callback: LayoutResultCallback, extras: Bundle?) { delegate.onLayout(old, new, signal, callback, extras) }
              override fun onWrite(pages: Array<out PageRange>, destination: ParcelFileDescriptor, signal: CancellationSignal, callback: WriteResultCallback) { delegate.onWrite(pages, destination, signal, callback) }
              override fun onFinish() { delegate.onFinish(); view.destroy() }
            }
            (activity.getSystemService(android.content.Context.PRINT_SERVICE) as PrintManager).print("ARVANTO", wrapper, null)
            promise.resolve(Arguments.createMap()); return
          }
          val target = File(context.cacheDir, "arvanto-${UUID.randomUUID()}.pdf")
          ArvantoPdfWriter.write(delegate, target, object : ArvantoPdfWriter.Listener {
            override fun complete() { view.destroy(); promise.resolve(Arguments.createMap().apply { putString("uri", target.toURI().toString()) }) }
            override fun failed(message: String?) { view.destroy(); promise.reject("PDF", message ?: "Error al generar PDF.") }
          })
        }
      }
      view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }
  }
  @ReactMethod fun recognizeText(uri: String, promise: Promise) = task(promise) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try { Arguments.createMap().apply { putString("text", Tasks.await(recognizer.process(InputImage.fromFilePath(context, Uri.fromFile(file(uri))))).text) } } finally { recognizer.close() }
  }
  @ReactMethod fun pdfPageCount(uri: String, promise: Promise) = task(promise) { PdfRenderer(ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY)).use { it.pageCount } }
  @ReactMethod fun pdfText(uri: String, promise: Promise) = task(promise) {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      PdfRenderer(ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY)).use { renderer ->
        require(renderer.pageCount <= 20) { "El PDF supera 20 páginas." }
        (0 until renderer.pageCount).joinToString("\n") { index -> renderer.openPage(index).use { page ->
          val scale = 1800.0 / maxOf(page.width, page.height)
          val bitmap = Bitmap.createBitmap(maxOf(1, (page.width * scale).toInt()), maxOf(1, (page.height * scale).toInt()), Bitmap.Config.ARGB_8888)
          try { bitmap.eraseColor(Color.WHITE); page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY); Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0))).text } finally { bitmap.recycle() }
        } }
      }
    } finally { recognizer.close() }
  }
  @ReactMethod fun scanBarcode(promise: Promise) {
    val activity = context.currentActivity ?: return promise.reject("NO_ACTIVITY", "Abre la app para escanear.")
    activity.runOnUiThread { GmsBarcodeScanning.getClient(activity).startScan().addOnSuccessListener { promise.resolve(it.rawValue) }.addOnCanceledListener { promise.resolve(null) }.addOnFailureListener { promise.reject("SCANNER", "No se pudo abrir el escáner. Verifica Google Play Services o escribe el código manualmente.", it) } }
  }
}
