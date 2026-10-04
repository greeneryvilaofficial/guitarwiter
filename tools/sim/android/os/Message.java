package android.os; public class Message { public Runnable r; public static Message obtain(Handler h,Runnable r){Message m=new Message(); m.r=r; return m;} public void setAsynchronous(boolean b){} }
