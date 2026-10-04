import com.keyboardkustom.app.NativeMicPitchDetector;
import android.media.AudioRecord;
import java.util.*;

public class Harness {
  static final int SR = 48000;
  static float[] sig; static long T0;
  static Random rnd = new Random(7);

  static double hz(int midi){ return 440.0*Math.pow(2,(midi-69)/12.0); }
  static void pluck(double t,int midi,double amp,boolean soft){
    int s0=(int)(t*SR); double f0=hz(midi); int n=(int)(1.5*SR);
    float[] x=new float[n]; double[] ph=new double[11];
    for(int k=1;k<=10;k++) ph[k]=rnd.nextDouble()*6.283;
    double pk=1e-9;
    for(int i=0;i<n;i++){ double tt=i/(double)SR, v=0;
      for(int k=1;k<=10;k++){ double tau=0.8/(1+0.4*k); v+=Math.pow(k,-1.1)*Math.exp(-tt/tau)*Math.sin(2*Math.PI*f0*k*tt+ph[k]); }
      if(soft) v*=Math.min(tt/0.006,1.0); else v+=rnd.nextGaussian()*Math.exp(-tt/0.002)*0.8;
      x[i]=(float)v; pk=Math.max(pk,Math.abs(v)); }
    for(int i=0;i<n && s0+i<sig.length;i++) sig[s0+i]+= (float)(amp*x[i]/pk);
  }
  static void pluckProf(double t,int midi,double amp,double[] prof){
    int s0=(int)(t*SR); double f0=hz(midi); int n=(int)(1.2*SR); float[] x=new float[n]; double pk=1e-9;
    double[] ph=new double[prof.length+1]; for(int k=1;k<=prof.length;k++) ph[k]=rnd.nextDouble()*6.283;
    for(int i=0;i<n;i++){ double tt=i/(double)SR, v=0;
      for(int k=1;k<=prof.length;k++){ double tau=0.7/(1+0.35*k); v+=prof[k-1]*Math.exp(-tt/tau)*Math.sin(2*Math.PI*f0*k*tt+ph[k]); }
      v+=rnd.nextGaussian()*Math.exp(-tt/0.002)*0.5; x[i]=(float)v; pk=Math.max(pk,Math.abs(v)); }
    for(int i=0;i<n && s0+i<sig.length;i++) sig[s0+i]+=(float)(amp*x[i]/pk);
  }
  // dengung panjang: nada dasar meluruh CEPAT (tau 0.35s), overtone ke-2/3/4 meluruh LAMBAT (tau 1.6s) -- kasus senar bass lewat mic HP
  static void pluckRing(double t,int midi,double amp){
    int s0=(int)(t*SR); double f0=hz(midi); int n=(int)(3.8*SR); float[] x=new float[n]; double pk=1e-9;
    double[] A={0.7,0.8,1.0,0.5,0.3}; double[] tau={0.35,1.6,1.6,1.2,0.8}; double[] ph=new double[6]; for(int k=1;k<=5;k++) ph[k]=rnd.nextDouble()*6.283;
    for(int i=0;i<n;i++){ double tt=i/(double)SR, v=0; for(int k=1;k<=5;k++) v+=A[k-1]*Math.exp(-tt/tau[k-1])*Math.sin(2*Math.PI*f0*k*tt+ph[k]);
      v+=rnd.nextGaussian()*Math.exp(-tt/0.002)*0.5; x[i]=(float)v; pk=Math.max(pk,Math.abs(v)); }
    for(int i=0;i<n && s0+i<sig.length;i++) sig[s0+i]+=(float)(amp*x[i]/pk);
  }
  static void voice(double t,double f0,double amp,double attack,double dur){
    int s0=(int)(t*SR), n=(int)(dur*SR); double ph=0; double[] y=new double[n]; double pk=1e-9;
    double[] z1=new double[3],z2=new double[3]; double[] fc={700,1200,2600}, bw={100,120,160};
    double prev=0;
    for(int i=0;i<n;i++){ ph+=f0/SR; double p=ph%1.0;
      double g= p<0.4?0.5*(1-Math.cos(Math.PI*p/0.4)):(p<0.6?Math.cos(Math.PI*(p-0.4)/0.4):0.0);
      double d=g-prev; prev=g; double v=d;
      for(int j=0;j<3;j++){ double r=Math.exp(-Math.PI*bw[j]/SR), th=2*Math.PI*fc[j]/SR;
        double out=(1-r)*v+2*r*Math.cos(th)*z1[j]-r*r*z2[j]; z2[j]=z1[j]; z1[j]=out; v=out; }
      y[i]=v; pk=Math.max(pk,Math.abs(v)); }
    for(int i=0;i<n && s0+i<sig.length;i++){ double tt=i/(double)SR; double env=Math.min(tt/attack,1.0);
      double rel=Math.min(1.0,(dur-tt)/0.08); sig[s0+i]+=(float)(amp*env*rel*y[i]/pk + rnd.nextGaussian()*0.003*env); }
  }

  public static void main(String[] a) throws Exception {
    String sc=a[0]; double total=0; List<double[]> plucks=new ArrayList<>(); // t, midi
    List<String> labels=new ArrayList<>();
    int N;
    switch(sc){
      case "single": total=11; N=(int)(total*SR); sig=new float[N]; noise();
        { int[] m={76,71,64,60,55,45}; double t=1.0; for(int x:m){ pluck(t,x,0.4,false); plucks.add(new double[]{t,x}); t+=1.6; } } break;
      case "single_soft": total=11; N=(int)(total*SR); sig=new float[N]; noise();
        { int[] m={76,71,64,60,55,45}; double t=1.0; for(int x:m){ pluck(t,x,0.15,true); plucks.add(new double[]{t,x}); t+=1.6; } } break;
      case "rapid": total=5; N=(int)(total*SR); sig=new float[N]; noise();
        { int[] m={70,71,72,73,74,75,76}; double t=1.0; for(int x:m){ pluck(t,x,0.4,false); plucks.add(new double[]{t,x}); t+=0.22; } } break;
      case "repeat": total=5; N=(int)(total*SR); sig=new float[N]; noise();
        { double t=1.0; for(int i=0;i<6;i++){ pluck(t,76,0.4,false); plucks.add(new double[]{t,76}); t+=0.25; } } break;
      case "voice": total=14; N=(int)(total*SR); sig=new float[N]; noise();
        { double t=1.0; double[][] v={{120,0.04},{180,0.04},{250,0.04},{330,0.04},{180,0.010},{330,0.010},{250,0.005}};
          for(double[] q:v){ voice(t,q[0],0.3,q[1],0.7); t+=1.6; } } break;
      case "seq": { double gap=Double.parseDouble(a[1]), amp=Double.parseDouble(a[2]); int cnt=8; total=1.0+gap*cnt+2.5; N=(int)(total*SR); sig=new float[N]; noise();
        int[] m={72,74,76,71,73,75,70,72}; double t=1.0; for(int i=0;i<cnt;i++){ pluck(t,m[i],amp,false); plucks.add(new double[]{t,m[i]}); t+=gap; } } break;
      case "harm": { double[] prof=parse(a[1]); int[] m={50,54,57,58,59,64,65,66,68,62,55,60,52,48}; double t=1.0; total=1.0+1.6*m.length+1; N=(int)(total*SR); sig=new float[N]; noise();
        for(int x:m){ pluckProf(t,x,0.4,prof); plucks.add(new double[]{t,x}); t+=1.6; } } break;
      case "ring": { int[] m={50,54,57,58,59,64,65,66}; double t=1.0; total=1.0+4.0*m.length+0.5; N=(int)(total*SR); sig=new float[N]; noise();
        for(int x:m){ pluckRing(t,x,0.35); plucks.add(new double[]{t,x}); t+=4.0; } } break;
      case "list": { double amp=Double.parseDouble(a[1]); int cnt=0; for(int i=2;i<a.length;i++) if(!a[i].contains("=")&&!a[i].equals("agc")) cnt++;
        total=1.0+1.4*cnt+1.0; N=(int)(total*SR); sig=new float[N]; noise(); double t=1.0;
        for(int i=2;i<a.length;i++){ if(a[i].contains("=")||a[i].equals("agc")) continue; int m=Integer.parseInt(a[i]); pluck(t,m,amp,false); plucks.add(new double[]{t,m}); t+=1.4; } } break;
      case "echoh": { // D3 keras, lalu A4 (=3x D3) pelan pada +gap ms; lalu A4 sungguhan keras 1.5 dtk kemudian
        double gap=Double.parseDouble(a[1]), amp2=Double.parseDouble(a[2]); total=5; N=(int)(total*SR); sig=new float[N]; noise();
        pluck(1.0,50,0.4,false); plucks.add(new double[]{1.0,50});
        pluck(1.0+gap/1000.0,69,amp2,false); plucks.add(new double[]{1.0+gap/1000.0,69});
        pluck(3.0,69,0.4,false); plucks.add(new double[]{3.0,69}); } break;
      default: throw new RuntimeException();
    }
    for(String q:a) if(q.startsWith("hp=")) applyHp(Double.parseDouble(q.substring(3)));
    if(a.length>0 && a[a.length-1].equals("agc")) applyAgc();
    final List<String> log=Collections.synchronizedList(new ArrayList<>());
    AudioRecord.SOURCE=()->{ T0=System.nanoTime(); final int[] pos={0};
      return (b,off,n)->{ for(int i=0;i<n;i++){ int p=pos[0]++; float v=p<sig.length?sig[p]:0f; b[off+i]=(short)Math.max(-32768,Math.min(32767,Math.round(v*32768f))); } }; };
    NativeMicPitchDetector d=new NativeMicPitchDetector(new android.content.Context());
    d.start(new NativeMicPitchDetector.Listener(){
      double ms(){ return (System.nanoTime()-T0)/1e6; }
      public void onOnsetDetected(){}
      public void onPitchIndex(int idx,double f){ log.add(String.format("%8.0f  NOTE  midi=%d f=%.1f",ms(),idx+40,f)); }
      public void onOutOfRange(double f){ log.add(String.format("%8.0f  OUT   f=%.1f",ms(),f)); }
      public void onUnclear(){ log.add(String.format("%8.0f  unclear",ms())); }
      public void onKick(){ log.add(String.format("%8.0f  KICK",ms())); }
      public void onNonTonalIgnored(){ log.add(String.format("%8.0f  nontonal-ignored",ms())); }
      public void onEchoBlocked(boolean s){ log.add(String.format("%8.0f  echo-blocked same=%b",ms(),s)); }
      public void onNotGuitar(int r){ log.add(String.format("%8.0f  NOT-GUITAR reason=%d",ms(),r)); }
    });
    Thread.sleep((long)(total*1000)+200); d.stop();
    System.out.println("== "+sc+" ==");
    for(double[] p:plucks) System.out.printf("  pluck  t=%6.0f ms  midi=%d%n",p[0]*1000,(int)p[1]);
    synchronized(log){ for(String s:log) System.out.println("  "+s); }
    if(sc.equals("ring")){
      for(double[] p:plucks){ System.out.printf("  pluck midi=%d @%d ms -> ",(int)p[1],(int)(p[0]*1000)); StringBuilder sb=new StringBuilder();
        for(String l:log){ if(!l.contains("NOTE")) continue; double tt=Double.parseDouble(l.substring(0,8).trim()); if(tt>=p[0]*1000&&tt<p[0]*1000+3900) sb.append(l.substring(l.indexOf("midi=")+5).split(" ")[0]).append("@+").append((int)(tt-p[0]*1000)).append("  "); }
        System.out.println(sb.length()==0?"(tidak ada)":sb); }
      System.exit(0); }
    if(sc.equals("harm")){
      System.out.println("  --- harapan(midi) -> terdeteksi (midi) pada jendela 900ms:");
      int bad=0; for(double[] p:plucks){ String got="(tidak ada)"; for(String l:log){ if(!l.contains("NOTE")) continue; double t=Double.parseDouble(l.substring(0,8).trim()); if(t>=p[0]*1000&&t<p[0]*1000+900){ got=l.substring(l.indexOf("midi=")+5).split(" ")[0]; break; } }
        boolean ok=got.equals(String.valueOf((int)p[1])); if(!ok) bad++; System.out.printf("    %d -> %s %s%n",(int)p[1],got,ok?"":"   <== SALAH"); }
      System.out.println("  -> salah/hilang: "+bad+" dari "+plucks.size()); System.exit(0); }
    if(!plucks.isEmpty()){
      int ok=0; List<Double> lat=new ArrayList<>();
      for(double[] p:plucks){ for(String s:log){ if(!s.contains("NOTE")) continue; double t=Double.parseDouble(s.substring(0,8).trim());
        if(t>=p[0]*1000 && t<p[0]*1000+900 && s.contains("midi="+(int)p[1]+" ")){ ok++; lat.add(t-p[0]*1000); break; } } }
      System.out.printf("  -> %d/%d petikan terdeteksi benar; latensi(ms)=%s%n",ok,plucks.size(),lat);
      long notes=log.stream().filter(s->s.contains("NOTE")).count();
      System.out.printf("  -> total NOTE terkirim=%d (harapan %d)%n",notes,plucks.size());
    } else { long notes=log.stream().filter(s->s.contains("NOTE")).count(); System.out.printf("  -> NOTE yang bocor dari suara = %d%n",notes); }
    System.exit(0);
  }
  // AGC kasar seperti di mic HP: attack cepat (turunkan gain saat keras), release lambat (naikkan gain saat sinyal meluruh)
  static void applyAgc(){ double env=0.01, gain=1; double target=0.15, maxGain=12;
    double aAtt=1-Math.exp(-1.0/(SR*0.004)), aRel=1-Math.exp(-1.0/(SR*0.35));
    for(int i=0;i<sig.length;i++){ double x=Math.abs(sig[i]); env += (x>env? aAtt: aRel)*(x-env);
      double g=Math.min(maxGain, target/Math.max(env,1e-4)); gain += 0.002*(g-gain); sig[i]=(float)Math.max(-1,Math.min(1,sig[i]*gain)); } }
  static double[] parse(String q){ String[] p=q.split(","); double[] r=new double[p.length]; for(int i=0;i<p.length;i++) r[i]=Double.parseDouble(p[i]); return r; }
  // high-pass orde-2 (Butterworth), meniru roll-off mic HP di frekuensi rendah
  static void applyHp(double fc){ double w0=2*Math.PI*fc/SR, cs=Math.cos(w0), al=Math.sin(w0)/(2*0.7071);
    double b0=(1+cs)/2,b1=-(1+cs),b2=(1+cs)/2,a0=1+al,a1=-2*cs,a2=1-al; b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;
    double x1=0,x2=0,y1=0,y2=0; for(int i=0;i<sig.length;i++){ double x=sig[i]; double y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2; x2=x1;x1=x;y2=y1;y1=y; sig[i]=(float)y; } }
  static void noise(){ for(int i=0;i<sig.length;i++) sig[i]=(float)(rnd.nextGaussian()*0.002); }
}
