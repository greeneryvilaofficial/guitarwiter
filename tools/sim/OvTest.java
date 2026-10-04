import com.keyboardkustom.app.NativeMicPitchDetector;
import java.lang.reflect.*; import java.util.*;
public class OvTest {
  static final int SR=48000, N=4096; static Random r=new Random(3);
  static void add(float[] w,double f,double amp,int from,int to,double decayTau){ for(int i=from;i<to;i++){ double t=(i-from)/(double)SR; w[i]+=(float)(amp*Math.exp(-t/decayTau)*Math.sin(2*Math.PI*f*i/SR)); } }
  static void noise(float[] w,double a){ for(int i=0;i<w.length;i++) w[i]+=(float)(r.nextGaussian()*a); }
  static float[] note(double f0,double[] amps,int from){ float[] w=new float[N]; for(int k=1;k<=amps.length;k++) add(w,f0*k,amps[k-1],from,N,2.0); return w; }
  public static void main(String[] a) throws Exception {
    NativeMicPitchDetector d=new NativeMicPitchDetector(new android.content.Context());
    Field fs=NativeMicPitchDetector.class.getDeclaredField("sampleRate"); fs.setAccessible(true); fs.setInt(d,SR);
    Field fo=NativeMicPitchDetector.class.getDeclaredField("onsetWin"); fo.setAccessible(true); float[] onsetWin=(float[])fo.get(d);
    Field fv=NativeMicPitchDetector.class.getDeclaredField("onsetWinValid"); fv.setAccessible(true);
    Method m=NativeMicPitchDetector.class.getDeclaredMethod("overtoneVerdict",float[].class,int.class,double.class,int[].class); m.setAccessible(true);
    String[] names={"AMAN(0)","ARAHKAN(1)","BUANG(2)"};
    class T{ String n; float[] w; float[] pre; double f; boolean expectOk; T(String n,float[] w,float[] pre,double f,boolean ok){this.n=n;this.w=w;this.pre=pre;this.f=f;this.expectOk=ok;} }
    List<T> ts=new ArrayList<>(); int on=Integer.parseInt(System.getProperty("on","900")); // onset ~ 800 sampel sebelum akhir jendela (seperti saat komit)
    double D3=146.83, A4=440.0;
    // 1) A4 sungguhan dipetik, hening sebelumnya
    { float[] w=note(A4,new double[]{1,.5,.3},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("A4 asli, hening sebelumnya",w,pre,A4,true)); }
    // 2) A4 asli + derau latar & dengung listrik 150 Hz yang SUDAH ada sebelum petikan
    { float[] w=note(A4,new double[]{1,.5,.3},on); add(w,150,0.03,0,N,1e9); noise(w,0.01); float[] pre=new float[N]; add(pre,150,0.03,0,N,1e9); noise(pre,0.01); ts.add(new T("A4 asli + hum 150Hz latar",w,pre,A4,true)); }
    // 3) A4 sengaja dipetik saat D3 MASIH berdengung kuat dari petikan sebelumnya
    { float[] w=note(A4,new double[]{1,.5,.3},on); add(w,D3,0.5,0,N,1.0); add(w,D3*2,0.2,0,N,1.0); noise(w,0.002); float[] pre=new float[N]; add(pre,D3,0.55,0,N,1.0); add(pre,D3*2,0.22,0,N,1.0); noise(pre,0.002); ts.add(new T("A4 asli saat D3 masih berdengung",w,pre,A4,true)); }
    // 4) KASUS BUG: D3 dipetik, nada dasar -20 dB dan overtone ke-3 dominan (YIN kunci ke 440), hening sebelumnya
    { float[] w=note(D3,new double[]{0.1,0.35,1.0,0.3,0.2},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("D3 dgn nada dasar -20dB (dibaca 440)",w,pre,A4*1.0011,false)); }
    // 5) KASUS BUG ringan: nada dasar -13 dB
    { float[] w=note(D3,new double[]{0.22,0.5,1.0,0.3,0.2},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("D3 dgn nada dasar -13dB (dibaca 440)",w,pre,A4*1.0011,false)); }
    // 6) F#5 asli (?123) vs F#4 dengan 2nd harmonic dominan
    double Fs5=739.99, Fs4=369.99;
    { float[] w=note(Fs5,new double[]{1,.4,.2},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("F#5 asli",w,pre,Fs5,true)); }
    { float[] w=note(Fs4,new double[]{0.12,1.0,0.3,0.2},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("F#4 'j' dgn nada dasar -18dB (dibaca F#5)",w,pre,Fs5,false)); }
    // 7) B5 asli (Enter) vs E4 ('g') dengan 3rd dominan
    double B5=987.77, E4=329.63;
    { float[] w=note(B5,new double[]{1,.3},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("B5 asli (Enter)",w,pre,B5,true)); }
    { float[] w=note(E4,new double[]{0.1,0.3,1.0,0.3},on); noise(w,0.002); float[] pre=new float[N]; noise(pre,0.002); ts.add(new T("E4 'g' dgn nada dasar -20dB (dibaca B5)",w,pre,B5,false)); }
    int bad=0;
    for(T t:ts){ System.arraycopy(t.pre,0,onsetWin,0,N); fv.setBoolean(d,true); int[] ix=new int[1]; int v=(int)m.invoke(d,t.w,N,t.f,ix);
      boolean ok = t.expectOk ? v==0 : v!=0; if(!ok) bad++;
      System.out.printf("  %-44s -> %-11s %s%s%n",t.n,names[v],v==1?("(idx "+ix[0]+" => midi "+(ix[0]+40)+") "):"",ok?"OK":"<== SALAH"); }
    System.out.println("  -> kasus salah: "+bad+" dari "+ts.size());
  }
}
