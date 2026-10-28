// Windows Shell identity shared by the launcher shortcut and its Edge app window.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
namespace ThoughtFork {
 [StructLayout(LayoutKind.Sequential,Pack=4)] public struct PropertyKey {public Guid fmtid;public uint pid;public PropertyKey(uint id){fmtid=new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");pid=id;}}
 [StructLayout(LayoutKind.Explicit,Size=24)] public struct PropVariant {[FieldOffset(0)]public ushort type;[FieldOffset(8)]public IntPtr value;}
 [ComImport,Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] public interface IPropertyStore {
  [PreserveSig]int GetCount(out uint count);[PreserveSig]int GetAt(uint index,out PropertyKey key);[PreserveSig]int GetValue(ref PropertyKey key,out PropVariant value);[PreserveSig]int SetValue(ref PropertyKey key,ref PropVariant value);[PreserveSig]int Commit();
 }
 public static class ShellIdentity {
  static Guid iid=new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
  [DllImport("shell32.dll")]static extern int SHGetPropertyStoreForWindow(IntPtr hwnd,ref Guid iid,out IPropertyStore store);
  [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SHGetPropertyStoreFromParsingName(string path,IntPtr context,uint flags,ref Guid iid,out IPropertyStore store);
  [DllImport("ole32.dll")]static extern int PropVariantClear(ref PropVariant value);
  delegate bool EnumProc(IntPtr hwnd,IntPtr param);
  [DllImport("user32.dll")]static extern bool EnumWindows(EnumProc proc,IntPtr param);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int length);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern int GetClassName(IntPtr hwnd,StringBuilder text,int length);
  [DllImport("user32.dll")]static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr hwnd);
  static void Set(IPropertyStore s,uint id,string text){var k=new PropertyKey(id);var v=new PropVariant{type=31,value=Marshal.StringToCoTaskMemUni(text)};try{Marshal.ThrowExceptionForHR(s.SetValue(ref k,ref v));}finally{PropVariantClear(ref v);}}
  static string Get(IPropertyStore s,uint id){var k=new PropertyKey(id);PropVariant v;Marshal.ThrowExceptionForHR(s.GetValue(ref k,out v));try{return v.type==31?Marshal.PtrToStringUni(v.value):null;}finally{PropVariantClear(ref v);}}
  public static long[] Windows(){var found=new List<long>();EnumWindows((h,p)=>{var title=new StringBuilder(512);var cls=new StringBuilder(128);GetWindowText(h,title,512);GetClassName(h,cls,128);if(IsWindowVisible(h)&&title.ToString()=="thoughtFork"&&cls.ToString()=="Chrome_WidgetWin_1")found.Add(h.ToInt64());return true;},IntPtr.Zero);return found.ToArray();}
  public static string WindowId(long handle){IPropertyStore s;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(new IntPtr(handle),ref iid,out s));try{return Get(s,5);}finally{Marshal.ReleaseComObject(s);}}
  public static string ShortcutId(string file){IPropertyStore s;Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(file,IntPtr.Zero,0,ref iid,out s));try{return Get(s,5);}finally{Marshal.ReleaseComObject(s);}}
  public static void SetShortcut(string file,string appId){IPropertyStore s;Marshal.ThrowExceptionForHR(SHGetPropertyStoreFromParsingName(file,IntPtr.Zero,2,ref iid,out s));try{Set(s,5,appId);Marshal.ThrowExceptionForHR(s.Commit());}finally{Marshal.ReleaseComObject(s);}}
  public static void SetWindow(long handle,string appId,string command,string icon){IPropertyStore s;Marshal.ThrowExceptionForHR(SHGetPropertyStoreForWindow(new IntPtr(handle),ref iid,out s));try{Set(s,2,command);Set(s,3,icon);Set(s,4,"thoughtFork");Set(s,5,appId);}finally{Marshal.ReleaseComObject(s);}}
  public static bool Focus(long handle){ShowWindow(new IntPtr(handle),9);return SetForegroundWindow(new IntPtr(handle));}
 }
}
