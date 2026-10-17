using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;

namespace Spacekeeper {
  public class ScanNode {
    public string Path,Name,ContentLock,ContainsLock;
    public int Index,Parent;
    public long Size,Files,Errors,Links;
    public bool Incomplete;
  }
  public static class FastScanner {
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
    struct FindData {
      public uint Attributes;
      public System.Runtime.InteropServices.ComTypes.FILETIME Creation,Access,Write;
      public uint SizeHigh,SizeLow,Reserved0,Reserved1;
      [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Name;
      [MarshalAs(UnmanagedType.ByValTStr,SizeConst=14)] public string AlternateName;
    }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    static extern IntPtr FindFirstFileExW(string p,int info,out FindData data,int search,IntPtr filter,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    [return:MarshalAs(UnmanagedType.Bool)] static extern bool FindNextFileW(IntPtr h,out FindData data);
    [DllImport("kernel32.dll")] static extern bool FindClose(IntPtr h);
    static readonly object Gate=new object(),OutputGate=new object();
    static readonly List<ScanNode> Nodes=new List<ScanNode>();
    static readonly List<string> Errors=new List<string>();
    static readonly List<string> Skipped=new List<string>();
    static readonly Dictionary<int,long> ErrorCounts=new Dictionary<int,long>();
    static readonly BlockingCollection<ScanNode> Queue=new BlockingCollection<ScanNode>();
    static long Files,Bytes,Links,Failures;
    static int Pending;
    static volatile bool Cancelled;
    static string Current="";
    public static string Quote(string s) {
      if(s==null)return "null";
      var b=new StringBuilder("\"");
      foreach(char c in s){
        switch(c){case '\\':b.Append("\\\\");break;case '"':b.Append("\\\"");break;case '\n':b.Append("\\n");break;case '\r':b.Append("\\r");break;case '\t':b.Append("\\t");break;default:if(c<32)b.Append("\\u"+((int)c).ToString("x4"));else b.Append(c);break;}
      }
      return b.Append('"').ToString();
    }
    static void Emit(string line){lock(OutputGate){Console.WriteLine(line);Console.Out.Flush();}}
    static ScanNode Add(string p,int parent) {
      lock(Gate){var n=new ScanNode{Path=p,Name=System.IO.Path.GetFileName(p.TrimEnd('\\')),Parent=parent,Index=Nodes.Count};if(n.Name=="")n.Name=p;Nodes.Add(n);Interlocked.Increment(ref Pending);Queue.Add(n);return n;}
    }
    static void Error(ScanNode n,int code,string message=null){
      n.Errors++;n.Incomplete=true;Interlocked.Increment(ref Failures);
      lock(Gate){if(!ErrorCounts.ContainsKey(code))ErrorCounts[code]=0;ErrorCounts[code]++;if(Errors.Count<200)Errors.Add("{\"path\":"+Quote(n.Path)+",\"code\":"+Quote("WIN32_"+code)+",\"message\":"+Quote(message??new System.ComponentModel.Win32Exception(code).Message)+"}");}
    }
    static void Read(ScanNode n) {
      Current=n.Path;
      string pattern=@"\\?\"+n.Path.TrimEnd('\\')+@"\*";
      FindData d; IntPtr h=FindFirstFileExW(pattern,1,out d,0,IntPtr.Zero,2);
      if(h==new IntPtr(-1)){
        int code=Marshal.GetLastWin32Error();
        if(code==87||code==50)h=FindFirstFileExW(pattern,0,out d,0,IntPtr.Zero,0);
        if(h==new IntPtr(-1)){code=Marshal.GetLastWin32Error();if(code!=2)Error(n,code);return;}
      }
      bool sys=false,winsxs=false,explorer=false,boot=false,bcd=false,sdi=false,uninstall=false;
      try {
        while(true){
          if(Cancelled)break;
          string name=d.Name;
          if(name!="."&&name!=".."){
            string lower=name.ToLowerInvariant();
            sys|=lower=="system32";winsxs|=lower=="winsxs";explorer|=lower=="explorer.exe";boot|=lower=="bootmgr";bcd|=lower=="bcd";sdi|=lower=="boot.sdi";
            uninstall|=lower=="uninstall.exe"||(lower.StartsWith("unins")&&System.Text.RegularExpressions.Regex.IsMatch(lower,@"^unins\d*\.exe$"));
            if((d.Attributes&0x400)!=0){
              n.Links++;n.Incomplete=true;Interlocked.Increment(ref Links);
              lock(Gate){if(Skipped.Count<200)Skipped.Add("{\"path\":"+Quote(System.IO.Path.Combine(n.Path,name))+",\"code\":\"REPARSE_POINT\",\"message\":\"Windows reparse point: junction, symbolic link or cloud placeholder; not followed to avoid reading another location or double counting.\"}");}
            }
            else if((d.Attributes&0x10)!=0)Add(System.IO.Path.Combine(n.Path,name),n.Index);
            else {long length=((long)d.SizeHigh<<32)|d.SizeLow;n.Size+=length;n.Files++;Interlocked.Add(ref Bytes,length);Interlocked.Increment(ref Files);}
          }
          if(!FindNextFileW(h,out d)){int code=Marshal.GetLastWin32Error();if(code!=18)Error(n,code);break;}
        }
      }finally{FindClose(h);}
      if(n.Path.TrimEnd('\\').Length>2){
        if(sys&&(winsxs||explorer))n.ContentLock="內容包含 Windows 系統目錄特徵";
        else if(boot||(bcd&&sdi))n.ContentLock="內容包含開機檔案特徵";
        else if(uninstall)n.ContentLock="內容包含程式解除安裝器，請使用 Windows 應用程式設定";
      }
    }
    static void Work(){
      foreach(var n in Queue.GetConsumingEnumerable()){
        try{if(!Cancelled)Read(n);}catch(Exception e){var native=e as System.ComponentModel.Win32Exception;Error(n,native==null?0:native.NativeErrorCode,e.Message);}
        finally{if(Interlocked.Decrement(ref Pending)==0)Queue.CompleteAdding();}
      }
    }
    static void Progress(object unused){
      int folders;lock(Gate){folders=Nodes.Count;}
      Emit("{\"type\":\"progress\",\"files\":"+Interlocked.Read(ref Files)+",\"bytes\":"+Interlocked.Read(ref Bytes)+",\"folders\":"+folders+",\"links\":"+Interlocked.Read(ref Links)+",\"failures\":"+Interlocked.Read(ref Failures)+",\"current\":"+Quote(Current)+"}");
    }
    static string JsonNode(ScanNode n){
      return "{\"path\":"+Quote(n.Path)+",\"parent\":"+(n.Parent<0?"null":Quote(Nodes[n.Parent].Path))+",\"name\":"+Quote(n.Name)+",\"size\":"+n.Size+",\"files\":"+n.Files+",\"errors\":"+n.Errors+",\"links\":"+n.Links+",\"incomplete\":"+(n.Incomplete?"true":"false")+",\"contentLock\":"+Quote(n.ContentLock)+",\"containsLock\":"+Quote(n.ContainsLock)+"}";
    }
    static int ListOnly(string root){
      FindData d;IntPtr h=FindFirstFileExW(@"\\?\"+root.TrimEnd('\\')+@"\*",1,out d,0,IntPtr.Zero,0);
      if(h==new IntPtr(-1)){int code=Marshal.GetLastWin32Error();if(code==2){Emit("{\"rows\":[]}");return 0;}throw new System.ComponentModel.Win32Exception(code);}
      var rows=new List<string>();
      try{while(true){if(d.Name!="."&&d.Name!=".."){
        bool link=(d.Attributes&0x400)!=0,dir=(d.Attributes&0x10)!=0;
        long size=dir||link?0:((long)d.SizeHigh<<32)|d.SizeLow;
        rows.Add("{\"path\":"+Quote(System.IO.Path.Combine(root,d.Name))+",\"name\":"+Quote(d.Name)+",\"size\":"+size+",\"files\":"+(dir||link?0:1)+",\"isFile\":"+(!dir&&!link?"true":"false")+",\"isLink\":"+(link?"true":"false")+",\"system\":"+((d.Attributes&4)!=0?"true":"false")+",\"incomplete\":"+(dir||link?"true":"false")+",\"links\":"+(link?1:0)+"}");
      }if(!FindNextFileW(h,out d)){int code=Marshal.GetLastWin32Error();if(code!=18)throw new System.ComponentModel.Win32Exception(code);break;}}}finally{FindClose(h);}
      Emit("{\"rows\":["+String.Join(",",rows)+"]}");return 0;
    }
    public static int Main(string[] args){
      Console.OutputEncoding=new UTF8Encoding(false);
      try {
        string root=System.IO.Path.GetFullPath(args[0]);if(args.Length>2&&args[2]=="list")return ListOnly(root);
        int count=Math.Max(1,Math.Min(8,int.Parse(args[1])));
        var input=new Thread(delegate(){try{Console.ReadLine();Cancelled=true;}catch{}});input.IsBackground=true;input.Start();
        Add(root,-1);var threads=new List<Thread>();
        using(var timer=new Timer(Progress,null,0,200)){
          for(int i=0;i<count;i++){var t=new Thread(Work);threads.Add(t);t.Start();}
          foreach(var t in threads)t.Join();
        }
        for(int i=Nodes.Count-1;i>=0;i--){
          var n=Nodes[i];if(Cancelled)n.Incomplete=true;
          if(n.Parent>=0){var p=Nodes[n.Parent];p.Size+=n.Size;p.Files+=n.Files;p.Errors+=n.Errors;p.Links+=n.Links;p.Incomplete|=n.Incomplete;if(n.ContentLock!=null||n.ContainsLock!=null)p.ContainsLock="包含具有系統或已安裝程式特徵的子目錄";}
        }
        for(int i=0;i<Nodes.Count;i+=256){var batch=new List<string>();for(int j=i;j<Math.Min(i+256,Nodes.Count);j++)batch.Add(JsonNode(Nodes[j]));Emit("{\"type\":\"batch\",\"nodes\":["+String.Join(",",batch)+"]}");}
        var counts=new List<string>();foreach(var pair in ErrorCounts)counts.Add(Quote("WIN32_"+pair.Key)+":"+pair.Value);
        Emit("{\"type\":\"complete\",\"files\":"+Files+",\"bytes\":"+Bytes+",\"folders\":"+Nodes.Count+",\"links\":"+Links+",\"failures\":"+Failures+",\"cancelled\":"+(Cancelled?"true":"false")+",\"errors\":["+String.Join(",",Errors)+"],\"skipped\":["+String.Join(",",Skipped)+"],\"errorCounts\":{"+String.Join(",",counts)+"}}");
        return 0;
      }catch(Exception e){Emit("{\"type\":\"fatal\",\"error\":"+Quote(e.Message)+"}");return 1;}
    }
  }
}
