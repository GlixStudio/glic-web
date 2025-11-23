import java.io.*;
import java.util.*;

public class PresetConverter {
    public static void main(String[] args) {
        File folder = new File("presets");
        File[] files = folder.listFiles();
        
        System.out.println("{");
        boolean first = true;
        
        if (files != null) {
            for (File f : files) {
                if (f.isFile() && !f.getName().startsWith(".")) {
                    if (!first) System.out.println(",");
                    first = false;
                    
                    System.out.print("  \"" + f.getName() + "\": ");
                    try {
                        FileInputStream fis = new FileInputStream(f);
                        ObjectInputStream ois = new ObjectInputStream(fis);
                        Object obj = ois.readObject();
                        ois.close();
                        
                        if (obj instanceof HashMap) {
                            HashMap map = (HashMap) obj;
                            printMap(map);
                        } else {
                            System.out.print("null");
                        }
                    } catch (Exception e) {
                        System.out.print("null");
                        // e.printStackTrace();
                    }
                }
            }
        }
        System.out.println("\n}");
    }
    
    static void printMap(HashMap map) {
        System.out.print("{");
        boolean first = true;
        for (Object key : map.keySet()) {
            if (!first) System.out.print(", ");
            first = false;
            
            String k = key.toString();
            Object v = map.get(key);
            
            System.out.print("\"" + k + "\": ");
            
            if (v instanceof Number) {
                System.out.print(v);
            } else if (v instanceof Boolean) {
                System.out.print(v);
            } else if (v instanceof float[]) {
                float[] arr = (float[]) v;
                System.out.print("[");
                for (int i=0; i<arr.length; i++) {
                    if (i>0) System.out.print(", ");
                    System.out.print(arr[i]);
                }
                System.out.print("]");
            } else {
                System.out.print("\"" + v.toString() + "\"");
            }
        }
        System.out.print("}");
    }
}
