using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Spacekeeper {
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }
  // Preserve the complete COM vtable order, including methods unused by this app.
  [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOperation {
    void Advise(IntPtr sink, out uint cookie);
    void Unadvise(uint cookie);
    void SetOperationFlags(uint flags);
    void SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
    void SetProgressDialog(IntPtr dialog);
    void SetProperties(IntPtr properties);
    void SetOwnerWindow(uint hwnd);
    void ApplyPropertiesToItem(IShellItem item);
    void ApplyPropertiesToItems([MarshalAs(UnmanagedType.IUnknown)] object items);
    void RenameItem(IShellItem item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void RenameItems([MarshalAs(UnmanagedType.IUnknown)] object items, [MarshalAs(UnmanagedType.LPWStr)] string name);
    void MoveItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void MoveItems([MarshalAs(UnmanagedType.IUnknown)] object items, IShellItem destination);
    void CopyItem(IShellItem item, IShellItem destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    void CopyItems([MarshalAs(UnmanagedType.IUnknown)] object items, IShellItem destination);
    void DeleteItem(IShellItem item, IntPtr sink);
    void DeleteItems([MarshalAs(UnmanagedType.IUnknown)] object items);
    void NewItem(IShellItem destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
    void PerformOperations();
    void GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
  }
  public static class ShellOperations {
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, PreserveSig=false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IShellItem item);
    static IShellItem Item(string path) {
      Guid iid = typeof(IShellItem).GUID; IShellItem item;
      SHCreateItemFromParsingName(path,IntPtr.Zero,ref iid,out item); return item;
    }
    public static void CheckTree(string root) {
      // Recheck native System/ReparsePoint attributes immediately before handing off.
      var queue=new Stack<string>(); queue.Push(root);
      while(queue.Count>0) {
        string p=queue.Pop(); var a=File.GetAttributes(p);
        if((a & FileAttributes.ReparsePoint)!=0) throw new IOException("Blocked: reparse point: "+p);
        if((a & FileAttributes.System)!=0) throw new IOException("Blocked: System attribute: "+p);
        if((a & FileAttributes.Directory)!=0) foreach(string entry in Directory.EnumerateFileSystemEntries(p)) queue.Push(entry);
      }
    }
    public static void Run(string action, string source, string destination, string name) {
      CheckTree(source);
      IFileOperation op=(IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
      IShellItem src=null,dst=null;
      try {
        // RecycleOnDelete enforces recycling. The app already requires typed confirmation.
        // Suppress the duplicate Shell recycle prompt only for this confirmed delete.
        // Move/rename retain native collision prompts as a last race-condition safeguard.
        uint flags=0x00080000 | 0x20000000 | 0x00100000 | 0x0400;
        if(action=="recycle") flags |= 0x0010;
        op.SetOperationFlags(flags);
        src=Item(source);
        if(action=="recycle") op.DeleteItem(src,IntPtr.Zero);
        else if(action=="move") { dst=Item(destination); op.MoveItem(src,dst,name,IntPtr.Zero); }
        else if(action=="rename") op.RenameItem(src,name,IntPtr.Zero);
        else throw new ArgumentException("Unknown operation");
        op.PerformOperations(); bool aborted; op.GetAnyOperationsAborted(out aborted);
        if(aborted) throw new IOException("Operation cancelled or incomplete. Refresh before retrying.");
      } finally {
        if(dst!=null) Marshal.ReleaseComObject(dst);
        if(src!=null) Marshal.ReleaseComObject(src);
        Marshal.ReleaseComObject(op);
      }
    }
  }
}
