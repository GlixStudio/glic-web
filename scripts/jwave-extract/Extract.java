import jwave.transforms.wavelets.Wavelet;
import jwave.transforms.wavelets.haar.*;
import jwave.transforms.wavelets.daubechies.*;
import jwave.transforms.wavelets.coiflet.*;
import jwave.transforms.wavelets.legendre.*;
import jwave.transforms.wavelets.symlets.*;
import jwave.transforms.wavelets.biorthogonal.*;
import jwave.transforms.wavelets.other.*;

public class Extract {
    // Mirror of GLIC transformation.pde createWavelet() switch
    static Wavelet createWavelet(int id) {
        switch (id) {
            case 67: return new Haar1();
            case 1: return new Haar1Orthogonal();
            case 44: return new Daubechies2();
            case 45: return new Daubechies3();
            case 46: return new Daubechies4();
            case 47: return new Daubechies5();
            case 48: return new Daubechies6();
            case 49: return new Daubechies7();
            case 50: return new Daubechies8();
            case 51: return new Daubechies9();
            case 52: return new Daubechies10();
            case 53: return new Daubechies11();
            case 54: return new Daubechies12();
            case 55: return new Daubechies13();
            case 56: return new Daubechies14();
            case 57: return new Daubechies15();
            case 58: return new Daubechies16();
            case 59: return new Daubechies17();
            case 60: return new Daubechies18();
            case 61: return new Daubechies19();
            case 62: return new Daubechies20();
            case 17: return new Coiflet1();
            case 18: return new Coiflet2();
            case 19: return new Coiflet3();
            case 20: return new Coiflet4();
            case 21: return new Coiflet5();
            case 41: return new Legendre1();
            case 42: return new Legendre2();
            case 43: return new Legendre3();
            case 22: return new Symlet2();
            case 23: return new Symlet3();
            case 24: return new Symlet4();
            case 25: return new Symlet5();
            case 26: return new Symlet6();
            case 27: return new Symlet7();
            case 28: return new Symlet8();
            case 29: return new Symlet9();
            case 30: return new Symlet10();
            case 31: return new Symlet11();
            case 32: return new Symlet12();
            case 33: return new Symlet13();
            case 34: return new Symlet14();
            case 35: return new Symlet15();
            case 36: return new Symlet16();
            case 37: return new Symlet17();
            case 38: return new Symlet18();
            case 39: return new Symlet19();
            case 40: return new Symlet20();
            case 2: return new BiOrthogonal11();
            case 3: return new BiOrthogonal13();
            case 4: return new BiOrthogonal15();
            case 5: return new BiOrthogonal22();
            case 6: return new BiOrthogonal24();
            case 7: return new BiOrthogonal26();
            case 8: return new BiOrthogonal28();
            case 9: return new BiOrthogonal31();
            case 10: return new BiOrthogonal33();
            case 11: return new BiOrthogonal35();
            case 12: return new BiOrthogonal37();
            case 13: return new BiOrthogonal39();
            case 14: return new BiOrthogonal44();
            case 15: return new BiOrthogonal55();
            case 16: return new BiOrthogonal68();
            case 66: return new DiscreteMayer();
            case 63: return new Battle23();
            case 64: return new CDF53();
            case 65: return new CDF97();
            default: return null;
        }
    }

    static void arr(StringBuilder sb, String key, double[] a) {
        sb.append("\"").append(key).append("\":[");
        for (int i = 0; i < a.length; i++) {
            if (i > 0) sb.append(",");
            double v = a[i];
            if (Double.isNaN(v)) sb.append("\"NaN\"");
            else if (Double.isInfinite(v)) sb.append(v > 0 ? "\"Infinity\"" : "\"-Infinity\"");
            else sb.append(Double.toString(v)); // shortest repr that round-trips
        }
        sb.append("]");
    }

    public static void main(String[] args) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\n");
        boolean first = true;
        for (int id = 1; id < 68; id++) {
            Wavelet w = createWavelet(id);
            if (w == null) { System.err.println("MISSING id " + id); continue; }
            if (!first) sb.append(",\n");
            first = false;
            sb.append("\"").append(id).append("\":{");
            sb.append("\"name\":\"").append(w.getName()).append("\",");
            sb.append("\"transformWavelength\":").append(w.getTransformWavelength()).append(",");
            arr(sb, "scalingDeCom", w.getScalingDeComposition()); sb.append(",");
            arr(sb, "waveletDeCom", w.getWaveletDeComposition()); sb.append(",");
            arr(sb, "scalingReCon", w.getScalingReConstruction()); sb.append(",");
            arr(sb, "waveletReCon", w.getWaveletReConstruction());
            sb.append("}");
        }
        sb.append("\n}\n");
        System.out.print(sb);
    }
}
