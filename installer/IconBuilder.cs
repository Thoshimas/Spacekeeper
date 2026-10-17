using System;
using System.IO;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;

public static class IconBuilder {
  static Color C(string hex){return ColorTranslator.FromHtml(hex);}
  static GraphicsPath Round(float x,float y,float w,float h,float radius){
    var p=new GraphicsPath();float d=radius*2;p.AddArc(x,y,d,d,180,90);p.AddArc(x+w-d,y,d,d,270,90);p.AddArc(x+w-d,y+h-d,d,d,0,90);p.AddArc(x,y+h-d,d,d,90,90);p.CloseFigure();return p;
  }
  public static Bitmap Draw(int size){
    var b=new Bitmap(size,size,PixelFormat.Format32bppArgb);
    using(var g=Graphics.FromImage(b)){
      g.SmoothingMode=SmoothingMode.AntiAlias;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.ScaleTransform(size/256f,size/256f);
      using(var outline=Round(8,8,240,240,58))using(var fill=new LinearGradientBrush(new Point(20,8),new Point(230,248),C("#6b7e61"),C("#40553f")))g.FillPath(fill,outline);
      using(var p=new Pen(Color.FromArgb(35,255,255,255),2))using(var border=Round(11,11,234,234,55))g.DrawPath(p,border);
      using(var shadow=new SolidBrush(Color.FromArgb(35,22,35,23)))using(var r=Round(45,89,169,123,18))g.FillPath(shadow,r);
      var back=new GraphicsPath();back.AddLines(new[]{new PointF(48,99),new PointF(48,77),new PointF(60,65),new PointF(108,65),new PointF(126,85),new PointF(195,85),new PointF(207,99)});back.CloseFigure();
      using(back)using(var brush=new SolidBrush(C("#d4cfb8")))g.FillPath(brush,back);
      using(var folder=Round(46,94,166,111,16))using(var fill=new LinearGradientBrush(new Point(46,94),new Point(212,205),C("#fcf6e9"),C("#e5dac0")))g.FillPath(fill,folder);
      using(var r=Round(65,114,49,69,9))using(var brush=new SolidBrush(C("#63785a")))g.FillPath(brush,r);
      using(var r=Round(124,114,68,29,8))using(var brush=new SolidBrush(C("#a4b294")))g.FillPath(brush,r);
      using(var r=Round(124,153,68,30,8))using(var brush=new SolidBrush(C("#bf8268")))g.FillPath(brush,r);
      using(var leaf=new GraphicsPath()){
        leaf.AddBezier(174,83,177,57,197,44,218,43);leaf.AddBezier(218,43,214,65,199,83,174,83);leaf.CloseFigure();
        using(var brush=new SolidBrush(C("#dce4c7")))g.FillPath(brush,leaf);
      }
    }return b;
  }
  static byte[] ImageBytes(int size){
    using(var bitmap=Draw(size))using(var ms=new MemoryStream()){
      if(size==256){bitmap.Save(ms,ImageFormat.Png);return ms.ToArray();}
      using(var w=new BinaryWriter(ms)){
        int row=((size+31)/32)*4;w.Write(40);w.Write(size);w.Write(size*2);w.Write((short)1);w.Write((short)32);w.Write(0);w.Write(size*size*4+row*size);w.Write(0);w.Write(0);w.Write(0);w.Write(0);
        for(int y=size-1;y>=0;y--)for(int x=0;x<size;x++){Color c=bitmap.GetPixel(x,y);w.Write(c.B);w.Write(c.G);w.Write(c.R);w.Write(c.A);}
        for(int y=0;y<size;y++)w.Write(new byte[row]);
        return ms.ToArray();
      }
    }
  }
  public static void Main(string[] args){
    string dir=args[0];Directory.CreateDirectory(dir);int[] sizes={16,24,32,48,64,128,256};var images=new List<byte[]>();foreach(int size in sizes)images.Add(ImageBytes(size));
    using(var w=new BinaryWriter(File.Create(Path.Combine(dir,"spacekeeper.ico")))){
      w.Write((short)0);w.Write((short)1);w.Write((short)sizes.Length);int offset=6+16*sizes.Length;
      for(int i=0;i<sizes.Length;i++){w.Write((byte)(sizes[i]==256?0:sizes[i]));w.Write((byte)(sizes[i]==256?0:sizes[i]));w.Write((byte)0);w.Write((byte)0);w.Write((short)1);w.Write((short)32);w.Write(images[i].Length);w.Write(offset);offset+=images[i].Length;}
      foreach(var image in images)w.Write(image);
    }
    using(var b=Draw(512))b.Save(Path.Combine(dir,"spacekeeper.png"),ImageFormat.Png);
    using(var b=new Bitmap(164,314,PixelFormat.Format24bppRgb))using(var g=Graphics.FromImage(b)){
      g.Clear(C("#eee9df"));g.SmoothingMode=SmoothingMode.AntiAlias;
      using(var logo=Draw(136))g.DrawImage(logo,14,62);
      using(var font=new Font("Segoe UI",12,FontStyle.Bold))using(var ink=new SolidBrush(C("#40553f"))){var format=new StringFormat{Alignment=StringAlignment.Center};g.DrawString("Spacekeeper",font,ink,new RectangleF(0,220,164,30),format);}
      using(var font=new Font("Segoe UI",8))using(var ink=new SolidBrush(C("#777b6e"))){var format=new StringFormat{Alignment=StringAlignment.Center};g.DrawString("A little room to breathe.",font,ink,new RectangleF(0,250,164,24),format);}
      b.Save(Path.Combine(dir,"installer-sidebar.bmp"),ImageFormat.Bmp);
    }
    using(var b=new Bitmap(150,57,PixelFormat.Format24bppRgb))using(var g=Graphics.FromImage(b)){
      g.Clear(C("#fdfbf6"));using(var logo=Draw(45))g.DrawImage(logo,2,6);using(var font=new Font("Segoe UI",10,FontStyle.Bold))using(var ink=new SolidBrush(C("#40553f")))g.DrawString("Spacekeeper",font,ink,49,18);
      b.Save(Path.Combine(dir,"installer-header.bmp"),ImageFormat.Bmp);
    }
  }
}
