package ru.nyamba.app;
import android.Manifest;
import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.graphics.Color;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.WebViewAssetLoader;
public class MainActivity extends Activity {
 private String pendingExport; private WebView web; private String origin; private GeolocationPermissions.Callback geo; private String geoOrigin;
 private static final String LOCAL="https://appassets.androidplatform.net";
 private boolean sameOrigin(String url){try{Uri u=Uri.parse(url),base=Uri.parse(origin);return "https".equals(u.getScheme())&&base.getHost().equals(u.getHost())&&u.getPort()==base.getPort();}catch(Exception e){return false;}}
 @Override public void onCreate(Bundle saved){super.onCreate(saved);origin=getPreferences(0).getString("server",LOCAL);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.WHITE);
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});
  LinearLayout bar=new LinearLayout(this);bar.setPadding(20,0,12,0);bar.setGravity(Gravity.CENTER_VERTICAL);TextView title=new TextView(this);title.setText("Нямба");title.setTextSize(18);title.setTextColor(Color.rgb(40,37,28));bar.addView(title,new LinearLayout.LayoutParams(0,48,1));Button server=new Button(this);server.setText("Сервер");server.setOnClickListener(v->configure());bar.addView(server);root.addView(bar);
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,0,1));setContentView(root);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setUserAgentString(settings.getUserAgentString()+" NyambaAndroid");settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);settings.setSupportMultipleWindows(false);CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  final WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){if(LOCAL.equals("https://"+request.getUrl().getHost())){if(request.getUrl().getPath().startsWith("/api/"))return new WebResourceResponse("application/json","UTF-8",503,"Offline",java.util.Collections.emptyMap(),new java.io.ByteArrayInputStream("{\"error\":\"Подключите свой сервер в меню Android.\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8)));return assets.shouldInterceptRequest(request.getUrl());}return null;}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){String url=r.getUrl().toString();if(url.startsWith("nyamba-export:")&&sameOrigin(web.getUrl())){if(url.length()>300000)return true;pendingExport=Uri.decode(url.substring(14));Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.setType("text/plain");save.addCategory(Intent.CATEGORY_OPENABLE);save.putExtra(Intent.EXTRA_TITLE,"Покупки Нямба.txt");startActivityForResult(save,20);return true;}if(sameOrigin(url))return false;if(r.isForMainFrame()&&(url.startsWith("https://")||url.startsWith("http://"))){try{startActivity(new Intent(Intent.ACTION_VIEW,r.getUrl()));}catch(Exception e){Toast.makeText(MainActivity.this,"Не найден браузер",Toast.LENGTH_SHORT).show();}}return true;}
   @Override public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e){if(r.isForMainFrame())runOnUiThread(()->new AlertDialog.Builder(MainActivity.this).setTitle("Сервер недоступен").setMessage("Проверьте подключение и адрес сервера. Локальное гостевое меню доступно через кнопку «Сервер».").setPositiveButton("Настроить",(d,w)->configure()).setNegativeButton("Закрыть",null).show());}
  });
  web.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String url,GeolocationPermissions.Callback cb){if(!sameOrigin(url)){cb.invoke(url,false,false);return;}geo=cb;geoOrigin=url;if(checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED)cb.invoke(url,true,false);else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},10);}});
  web.setDownloadListener((url,ua,cd,mime,length)->Toast.makeText(this,"Скачивание списка: откройте сервер в обычном браузере. В приложении список доступен в разделе «Покупки».",Toast.LENGTH_LONG).show());
  load();
 }
 private void load(){web.loadUrl(origin+(origin.equals(LOCAL)?"/index.html":"/"));}
 private void configure(){EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(17);input.setHint("https://nyamba.example.ru");input.setText(origin.equals(LOCAL)?"":origin);AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Ваш сервер Нямбы").setMessage("Укажите HTTPS-адрес после развёртывания. Данные локального гостя и сервера хранятся отдельно.").setView(input).setPositiveButton("Подключить",null).setNeutralButton("Локально",(d,w)->{origin=LOCAL;getPreferences(0).edit().remove("server").apply();load();}).setNegativeButton("Отмена",null).create();dialog.setOnShowListener(d->dialog.getButton(-1).setOnClickListener(v->{String value=input.getText().toString().trim();Uri u=Uri.parse(value);if(!"https".equals(u.getScheme())||u.getHost()==null||u.getUserInfo()!=null||u.getQuery()!=null||u.getFragment()!=null||!(u.getPath()==null||u.getPath().isEmpty()||u.getPath().equals("/"))){input.setError("Нужен HTTPS-адрес без пути, пароля и параметров");return;}origin="https://"+u.getEncodedAuthority();getPreferences(0).edit().putString("server",origin).apply();dialog.dismiss();load();}));dialog.show();}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==10&&geo!=null){boolean ok=false;for(int r:results)ok|=r==PackageManager.PERMISSION_GRANTED;geo.invoke(geoOrigin,ok,false);geo=null;}}
 @Override public void onBackPressed(){web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){d.close();return true}return false})()",result->{if(!"true".equals(result)){if(web.canGoBack())web.goBack();else super.onBackPressed();}});}
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==20&&result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingExport!=null){try(java.io.OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingExport.getBytes(java.nio.charset.StandardCharsets.UTF_8));Toast.makeText(this,"Список сохранён",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"Не удалось сохранить список",Toast.LENGTH_LONG).show();}}if(request==20)pendingExport=null;}
 @Override protected void onDestroy(){if(web!=null)web.destroy();super.onDestroy();}
}
