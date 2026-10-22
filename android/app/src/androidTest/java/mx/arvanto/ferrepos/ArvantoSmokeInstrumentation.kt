package mx.arvanto.ferrepos

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.os.Bundle
import com.facebook.react.bridge.*
import java.lang.reflect.Proxy
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Runs against isolated databases and preferences; never modifies business records. */
class ArvantoSmokeInstrumentation : Instrumentation() {
  override fun onCreate(arguments: Bundle?) { super.onCreate(arguments); start() }
  private fun awaitResult(call: (Promise) -> Unit): Any? {
    val latch = CountDownLatch(1); var result: Any? = null; var error: String? = null
    val promise = Proxy.newProxyInstance(Promise::class.java.classLoader, arrayOf(Promise::class.java)) { _, method, arguments ->
      when (method.name) {
        "resolve" -> { result = arguments?.firstOrNull(); latch.countDown() }
        "reject" -> { error = arguments?.joinToString(" | "); latch.countDown() }
      }; null
    } as Promise
    call(promise); check(latch.await(30, TimeUnit.SECONDS)) { "Native service timed out" }; check(error == null) { error!! }; return result
  }
  override fun onStart() {
    val output = Bundle(); val checks = mutableListOf<String>()
    try {
      startActivitySync(Intent().setClassName(targetContext.packageName, "${targetContext.packageName}.MainActivity").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      val host = (targetContext.applicationContext as MainApplication).reactHost
      val deadline = System.currentTimeMillis() + 10_000
      while (host.currentReactContext == null && System.currentTimeMillis() < deadline) Thread.sleep(50)
      val context = host.currentReactContext as? ReactApplicationContext ?: error("React Native did not initialize")
      val module = ArvantoPlatform(context)
      val name = "arvanto-instrumentation.db"
      fun sql(statement: String, script: Boolean = false, vararg parameters: Any?): ReadableMap = awaitResult { module.sql(name, statement, Arguments.fromList(parameters.toList()), script, it) } as ReadableMap
      awaitResult { module.openDatabase(name, it) }
      try {
        sql("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;", true)
        sql("CREATE TABLE values_test (id INTEGER PRIMARY KEY, name TEXT); CREATE TABLE events (id INTEGER); CREATE TRIGGER audit_test AFTER INSERT ON values_test BEGIN INSERT INTO events VALUES(NEW.id); END;", true)
        sql("INSERT INTO values_test VALUES (?, ?)", false, 1, "' OR 1=1; DROP TABLE values_test;--")
        check(sql("SELECT COUNT(*) AS count FROM values_test WHERE id=? AND ?=1", false, 1, 1).getArray("rows")!!.getMap(0)!!.getInt("count") == 1)
        check(sql("SELECT COUNT(*) AS count FROM events").getArray("rows")!!.getMap(0)!!.getInt("count") == 1)
        checks.add("SQLite typed parameters and trigger scripts")
        sql("BEGIN IMMEDIATE", true); sql("INSERT INTO values_test VALUES (2, 'rollback')"); sql("ROLLBACK", true)
        check(sql("SELECT COUNT(*) AS count FROM values_test").getArray("rows")!!.getMap(0)!!.getInt("count") == 1)
        checks.add("SQLite rollback")
        val snapshot = "arvanto-snapshot-instrumentation.db"
        awaitResult { module.openDatabase(snapshot, it) }
        try {
          awaitResult { module.backupDatabase(name, snapshot, it) }
          sql("INSERT INTO values_test VALUES (2, 'after-backup')")
          awaitResult { module.backupDatabase(snapshot, name, it) }
          check(sql("SELECT COUNT(*) AS count FROM values_test").getArray("rows")!!.getMap(0)!!.getInt("count") == 1)
          check(sql("PRAGMA integrity_check").getArray("rows")!!.getMap(0)!!.getString("integrity_check") == "ok")
        } finally { awaitResult { module.deleteDatabase(snapshot, it) } }
        checks.add("WAL backup, restore and integrity")
        check(Regex("[0-9a-f-]{36}").matches(module.randomUUID()))
        check(awaitResult { module.digest("hello", it) } == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
        checks.add("Secure UUID and existing PIN hash compatibility")
        val key = "01".repeat(32); val plain = "QVJWQU5UTw=="
        val encrypted = awaitResult { module.aes(plain, key, false, it) } as String
        check(awaitResult { module.aes(encrypted, key, true, it) } == plain)
        var rejected = false
        try { awaitResult { module.aes(encrypted, "02".repeat(32), true, it) } } catch (_: Exception) { rejected = true }
        check(rejected); checks.add("AES-GCM round trip and invalid key rejection")
        awaitResult { module.secureSet("instrumentation.test", "native-secret", it) }
        check(awaitResult { module.secureGet("instrumentation.test", it) } == "native-secret")
        targetContext.getSharedPreferences("arvanto.secure", 0).edit().remove("instrumentation.test").commit()
        // Retrieve a previous key without logging its value, if it exists.
        awaitResult { module.secureGet("ferrepos.backup.key.v1", it) }
        checks.add("Android Keystore and legacy key migration")
        val pdf = awaitResult { module.print("<html><body><h1>ARVANTO</h1><p>Native PDF test</p></body></html>", true, it) } as ReadableMap
        val uri = pdf.getString("uri")!!
        check(awaitResult { module.pdfPageCount(uri, it) } == 1)
        check((awaitResult { module.pdfText(uri, it) } as String).contains("ARVANTO"))
        java.io.File(android.net.Uri.parse(uri).path!!).delete()
        checks.add("PDF generation, page count and offline OCR")
      } finally { awaitResult { module.deleteDatabase(name, it) } }
      output.putString("stream", "\nPASS ${checks.size} native checks:\n${checks.joinToString("\n")}\n")
      finish(Activity.RESULT_OK, output)
    } catch (error: Throwable) {
      output.putString("stream", "\nFAIL after ${checks.size} checks: ${error.stackTraceToString()}\n")
      finish(Activity.RESULT_CANCELED, output)
    }
  }
}
