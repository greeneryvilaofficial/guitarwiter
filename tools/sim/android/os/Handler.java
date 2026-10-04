package android.os; public class Handler { public Handler(Looper l){} public boolean sendMessage(Message m){ m.r.run(); return true; } }
