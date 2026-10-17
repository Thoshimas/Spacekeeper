using System;
using System.IO;
using System.Text;
using System.Net;
using System.Diagnostics;
using System.Drawing;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Threading;
using System.Threading.Tasks;

internal static class Launcher {
  static readonly string Root=Path.GetFullPath(AppDomain.CurrentDomain.BaseDirectory).TrimEnd('\\');
  static readonly JavaScriptSerializer Json=new JavaScriptSerializer{MaxJsonLength=8*1024*1024};
  static readonly bool Elevated=new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
  static string Key(string p){return Path.GetFullPath(p).TrimEnd('\\').ToLowerInvariant();}
  static string Hash(string p){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Key(p)))).Replace("-","").ToLowerInvariant().Substring(0,20);}
  static string DataDir {get{return File.Exists(Path.Combine(Root,"installation.ini"))?Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"Spacekeeper","Installs",Hash(Root)):Root;}}
  static string SessionFile {get{return Path.Combine(DataDir,".runtime",Elevated?"service-admin.json":"service.json");}}
  static Dictionary<string,object> ReadJson(string p){return Json.Deserialize<Dictionary<string,object>>(File.ReadAllText(p,Encoding.UTF8));}
  static string Language(){
    try{var p=ReadJson(Path.Combine(DataDir,"preferences.json"));if(p.ContainsKey("language")&&p["language"].ToString()=="en")return "en";if(p.ContainsKey("language")&&p["language"].ToString()=="zh-Hant")return "zh-Hant";}catch{}
    try{foreach(var line in File.ReadAllLines(Path.Combine(Root,"installation.ini")))if(line.Trim().Equals("Language=zh-Hant",StringComparison.OrdinalIgnoreCase))return "zh-Hant";}catch{}
    return "en";
  }
  static string Q(string text){return "\""+text.Replace("\"","\\\"")+"\"";}
  static int RemoveShortcut(string file){
    if(!File.Exists(file))return 0;
    if(!file.EndsWith(".lnk",StringComparison.OrdinalIgnoreCase)||(File.GetAttributes(file)&FileAttributes.ReparsePoint)!=0)return 3;
    object shell=null,shortcut=null;
    try{
      Type type=Type.GetTypeFromProgID("WScript.Shell");shell=Activator.CreateInstance(type);
      shortcut=type.InvokeMember("CreateShortcut",System.Reflection.BindingFlags.InvokeMethod,null,shell,new object[]{file});
      string target=shortcut.GetType().InvokeMember("TargetPath",System.Reflection.BindingFlags.GetProperty,null,shortcut,null).ToString();
      if(Key(target)!=Key(Path.Combine(Root,"Spacekeeper.exe"))&&Key(target)!=Key(Path.Combine(Root,"Uninstall.exe")))return 3;
      File.Delete(file);return 0;
    }finally{if(shortcut!=null)System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shortcut);if(shell!=null)System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell);}
  }
  static Uri SessionUri(Dictionary<string,object> session){
    if(session.ContainsKey("appDir")&&Key(session["appDir"].ToString())!=Key(Root))throw new Exception("Session belongs to another installation.");
    var uri=new Uri(session["url"].ToString());
    if(uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1024||uri.AbsolutePath!="/"||!System.Text.RegularExpressions.Regex.IsMatch(uri.Fragment,"^#[a-f0-9]{64}$"))throw new Exception("Invalid local session.");
    return uri;
  }
  static Dictionary<string,object> Call(Dictionary<string,object> session,string route){
    var uri=SessionUri(session);var request=(HttpWebRequest)WebRequest.Create(uri.GetLeftPart(UriPartial.Authority)+"/api/"+route);
    request.Proxy=null;request.Method="POST";request.Timeout=2500;request.ReadWriteTimeout=2500;request.ContentType="application/json";request.Headers["X-Space-Token"]=uri.Fragment.Substring(1);
    byte[] body=Encoding.UTF8.GetBytes("{}");request.ContentLength=body.Length;using(var stream=request.GetRequestStream())stream.Write(body,0,body.Length);
    using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8)){
      var result=Json.Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
      if(route=="status"&&session.ContainsKey("instanceId")&&session["instanceId"].ToString()!=result["instanceId"].ToString())throw new Exception("Session identity changed.");
      return result;
    }
  }
  static Dictionary<string,object> Running(){try{var session=ReadJson(SessionFile);Call(session,"status");return session;}catch{return null;}}
  static Dictionary<string,object> RunningAt(string file){try{var session=ReadJson(file);Call(session,"status");return session;}catch{return null;}}
  static IEnumerable<Dictionary<string,object>> AllSessions(){foreach(string file in new[]{"service.json","service-admin.json"}){var s=RunningAt(Path.Combine(DataDir,".runtime",file));if(s!=null)yield return s;}}
  static void Open(Dictionary<string,object> session,string language){
    var uri=new UriBuilder(SessionUri(session));uri.Query="lang="+(language??Language());string url=uri.Uri.AbsoluteUri;
    string[] roots={Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles)};
    foreach(string r in roots){string edge=Path.Combine(r,"Microsoft","Edge","Application","msedge.exe");if(File.Exists(edge)){Process.Start(new ProcessStartInfo(edge,"--app="+Q(url)+" --new-window"){UseShellExecute=false,CreateNoWindow=true});return;}}
    Process.Start(new ProcessStartInfo(url){UseShellExecute=true});
  }
  static bool ValidateDirectory(string input){
    if(string.IsNullOrWhiteSpace(input)||!System.Text.RegularExpressions.Regex.IsMatch(input,"^[A-Za-z]:[\\\\/]"))return false;
    string p=Path.GetFullPath(input).TrimEnd('\\');if(p.Length<4||input.IndexOf('"')>=0||input.Substring(2).Contains(":"))return false;
    foreach(string segment in p.Substring(3).Split('\\'))if(segment.EndsWith(".")||segment.EndsWith(" ")||System.Text.RegularExpressions.Regex.IsMatch(segment,"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\\.|$)",System.Text.RegularExpressions.RegexOptions.IgnoreCase))return false;
    string windows=Key(Environment.GetFolderPath(Environment.SpecialFolder.Windows));if(Key(p)==windows||Key(p).StartsWith(windows+"\\"))return false;
    foreach(string special in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),Environment.GetFolderPath(Environment.SpecialFolder.Desktop),Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)})if(!string.IsNullOrEmpty(special)&&Key(p)==Key(special))return false;
    for(string cursor=p;cursor!=null;cursor=Path.GetDirectoryName(cursor))if((Directory.Exists(cursor)||File.Exists(cursor))&&(File.GetAttributes(cursor)&FileAttributes.ReparsePoint)!=0)return false;
    if(File.Exists(p))return false;
    if(Directory.Exists(p)&&Directory.GetFileSystemEntries(p).Length>0){
      string marker=Path.Combine(p,"installation.ini");if(!File.Exists(marker)||!File.ReadAllText(marker).Contains("Product=Spacekeeper"))return false;
    }
    return true;
  }
  static Dictionary<string,object> Start(string forcedLanguage){
    string node=Path.Combine(Root,"runtime","node.exe"),script=Path.Combine(Root,"server.mjs");
    if(!File.Exists(node)||!File.Exists(script))throw new Exception("Required application files are missing. Reinstall Spacekeeper.");
    Directory.CreateDirectory(Path.Combine(DataDir,".runtime"));
    string stderr="",line=null;object gate=new object();
    var process=new Process{StartInfo=new ProcessStartInfo(node,Q(script)+" --no-open"+(forcedLanguage==null?"":" --language "+forcedLanguage)){WorkingDirectory=Root,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8}};
    process.OutputDataReceived+=(s,e)=>{if(e.Data!=null)lock(gate){if(line==null)line=e.Data;}};
    process.ErrorDataReceived+=(s,e)=>{if(e.Data!=null)lock(gate){stderr=(stderr+e.Data+Environment.NewLine);if(stderr.Length>5000)stderr=stderr.Substring(stderr.Length-5000);}};
    process.Start();process.BeginOutputReadLine();process.BeginErrorReadLine();
    DateTime until=DateTime.UtcNow.AddSeconds(45);
    while(DateTime.UtcNow<until){
      string reported;lock(gate)reported=line;
      if(reported!=null){
        var session=Json.Deserialize<Dictionary<string,object>>(reported);session["appDir"]=Root;
        var status=Call(session,"status");session["instanceId"]=status["instanceId"];return session;
      }
      if(process.HasExited){lock(gate){File.WriteAllText(Path.Combine(DataDir,".runtime","launcher-error.log"),stderr,Encoding.UTF8);throw new Exception(string.IsNullOrWhiteSpace(stderr)?"The local service exited before it was ready.":stderr);}}
      Thread.Sleep(100);
    }
    throw new Exception("The local service did not become ready within 45 seconds. Try opening Spacekeeper again.");
  }
  static void Run(bool noOpen,string forcedLanguage){
    string mutexName="Local\\SpacekeeperLauncher-"+Hash(Root)+"-"+(Elevated?"admin":"standard");
    using(var mutex=new Mutex(false,mutexName)){
      bool held=false;try{try{held=mutex.WaitOne(15000);}catch(AbandonedMutexException){held=true;}if(!held)throw new Exception("Spacekeeper is already starting. Please wait.");
        var session=Running();bool reused=session!=null;if(session==null)session=Start(forcedLanguage);if(!noOpen)Open(session,forcedLanguage);
        Console.WriteLine(Json.Serialize(new{ok=true,reused=reused}));
      }finally{if(held)mutex.ReleaseMutex();}
    }
  }
  [STAThread] public static int Main(string[] args){
    try{
      if(args.Length==2&&args[0]=="--validate-install-dir")return ValidateDirectory(args[1])?0:2;
      if(args.Length==2&&args[0]=="--install-id"){Console.Write(Hash(args[1]));return 0;}
      if(args.Length==2&&args[0]=="--remove-shortcut")return RemoveShortcut(args[1]);
      if(Array.IndexOf(args,"--check-running")>=0){foreach(var session in AllSessions())return 0;return 3;}
      if(Array.IndexOf(args,"--shutdown")>=0){foreach(var session in AllSessions())Call(session,"shutdown");for(int i=0;i<40;i++){Thread.Sleep(100);bool any=false;foreach(var session in AllSessions())any=true;if(!any)return 0;}return 2;}
      bool noOpen=Array.IndexOf(args,"--no-open")>=0;string forced=null;int lang=Array.IndexOf(args,"--language");if(lang>=0&&lang+1<args.Length&&new[]{"en","zh-Hant"}.ContainsValue(args[lang+1]))forced=args[lang+1];
      if(noOpen){Run(true,forced);return 0;}
      Application.EnableVisualStyles();bool english=(forced??Language())=="en";
      using(var form=new Form{Text="Spacekeeper",ClientSize=new Size(390,150),FormBorderStyle=FormBorderStyle.FixedDialog,StartPosition=FormStartPosition.CenterScreen,MaximizeBox=false,MinimizeBox=false,BackColor=ColorTranslator.FromHtml("#f6f3ec")}){
        form.Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var picture=new PictureBox{Image=form.Icon.ToBitmap(),SizeMode=PictureBoxSizeMode.Zoom,Bounds=new Rectangle(24,36,64,64)};form.Controls.Add(picture);
        form.Controls.Add(new Label{Text=english?"Opening Spacekeeper":"正在開啟 Spacekeeper",Font=new Font("Segoe UI",13,FontStyle.Bold),ForeColor=ColorTranslator.FromHtml("#40553f"),Bounds=new Rectangle(105,38,270,32)});
        form.Controls.Add(new Label{Text=english?"Preparing your local workspace…":"正在準備本機工作空間…",Font=new Font("Segoe UI",10),ForeColor=ColorTranslator.FromHtml("#777b6e"),Bounds=new Rectangle(105,78,270,40)});
        form.ControlBox=false;Exception failure=null;
        form.Shown+=(s,e)=>Task.Factory.StartNew(()=>{try{Run(false,forced);}catch(Exception ex){failure=ex;}finally{form.BeginInvoke(new Action(()=>form.Close()));}});
        Application.Run(form);if(failure!=null)throw failure;
      }
      return 0;
    }catch(Exception e){Console.Error.WriteLine(e.Message);if(args.Length==0||args[0]=="--language")MessageBox.Show((Language()=="en"?"Spacekeeper could not start.\n\n":"Spacekeeper 無法啟動。\n\n")+e.Message,"Spacekeeper",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
  }
  static bool ContainsValue(this string[] values,string value){return Array.IndexOf(values,value)>=0;}
}
