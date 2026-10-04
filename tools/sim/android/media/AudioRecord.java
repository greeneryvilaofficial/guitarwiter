package android.media;
public class AudioRecord {
  public static final int STATE_INITIALIZED=1;
  public static java.util.function.Supplier<Source> SOURCE;
  public interface Source { void read(short[] b,int off,int n); }
  private Source src; private int rate; private long startNs; private long samplesRead=0; private volatile boolean stopped=false;
  public static int getMinBufferSize(int r,int c,int e){return 4096;}
  public AudioRecord(int a,int rate,int c,int e,int buf){this.rate=rate; src=SOURCE.get();}
  public int getState(){return STATE_INITIALIZED;}
  public void startRecording(){startNs=System.nanoTime();}
  public void stop(){stopped=true;} public void release(){stopped=true;}
  // real-time paced: block until the samples would have been captured by hardware
  public int read(short[] b,int off,int n){
    if(stopped) return -1;
    samplesRead+=n;
    long dueNs=startNs+(long)(samplesRead*1e9/rate);
    long w=dueNs-System.nanoTime();
    if(w>0){ try{Thread.sleep(w/1_000_000,(int)(w%1_000_000));}catch(Exception ex){} }
    src.read(b,off,n); return n;
  }
}
