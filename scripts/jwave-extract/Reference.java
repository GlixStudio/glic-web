import jwave.transforms.BasicTransform;
import jwave.transforms.FastWaveletTransform;
import jwave.transforms.WaveletPacketTransform;
import jwave.transforms.wavelets.Wavelet;

// Generates reference forward/reverse outputs for every wavelet id through the REAL JWave,
// using the same code path as GLIC (BasicTransform.forward(double[][]) / reverse).
public class Reference {
    public static void main(String[] args) throws Throwable {
        int size = 8;
        // deterministic LCG matching the TS test generator
        StringBuilder sb = new StringBuilder("{\n");
        boolean first = true;
        for (int id = 1; id < 68; id++) {
            Wavelet w = Extract.createWavelet(id);
            for (int type = 0; type < 2; type++) {
                BasicTransform t = type == 0 ? new FastWaveletTransform(w) : new WaveletPacketTransform(w);
                long seed = (long) (id * 7 + type);
                long s = seed;
                double[][] m = new double[size][size];
                for (int x = 0; x < size; x++) {
                    for (int y = 0; y < size; y++) {
                        s = (s * 1664525L + 1013904223L) & 0xffffffffL;
                        m[x][y] = Math.floor((s / 4294967296.0) * 256.0) / 255.0;
                    }
                }
                double[][] fwd = t.forward(m);
                double[][] rev = t.reverse(fwd);
                if (!first) sb.append(",\n");
                first = false;
                sb.append("\"").append(id).append("_").append(type).append("\":{\"fwd\":[");
                appendFlat(sb, fwd, size);
                sb.append("],\"rev\":[");
                appendFlat(sb, rev, size);
                sb.append("]}");
            }
        }
        sb.append("\n}\n");
        System.out.print(sb);
    }

    static void appendFlat(StringBuilder sb, double[][] m, int size) {
        for (int x = 0; x < size; x++) {
            for (int y = 0; y < size; y++) {
                if (x + y > 0) sb.append(",");
                double v = m[x][y];
                if (Double.isNaN(v)) sb.append("\"NaN\"");
                else if (Double.isInfinite(v)) sb.append(v > 0 ? "\"Infinity\"" : "\"-Infinity\"");
                else sb.append(Double.toString(v));
            }
        }
    }
}
