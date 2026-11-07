// Ghidra headless post-script: dump program metadata + function inventory.
// Usage (analyzeHeadless):
//   -postScript DumpFunctions.java <out.json> [maxDecompile]
//
// The JSON is intentionally simple (no Gson dependency) so it compiles with
// only the Ghidra API on the script classpath.

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionManager;

import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;

public class DumpFunctions extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] scriptArgs = getScriptArgs();
        if (scriptArgs.length < 1) {
            println("usage: DumpFunctions <out.json> [maxDecompile]");
            return;
        }
        String outPath = scriptArgs[0];
        int maxDecompile = scriptArgs.length > 1 ? Integer.parseInt(scriptArgs[1]) : 0;

        DecompInterface ifc = null;
        if (maxDecompile > 0) {
            ifc = new DecompInterface();
            ifc.openProgram(currentProgram);
        }

        FunctionManager fm = currentProgram.getFunctionManager();
        int total = fm.getFunctionCount();

        StringBuilder sb = new StringBuilder(1 << 20);
        sb.append("{\"program\":\"").append(esc(currentProgram.getName())).append("\",");
        sb.append("\"language\":\"").append(esc(currentProgram.getLanguageID().toString())).append("\",");
        sb.append("\"imageBase\":\"").append(currentProgram.getImageBase()).append("\",");
        sb.append("\"functionCount\":").append(total).append(",");
        sb.append("\"functions\":[");

        int n = 0;
        for (Function f : fm.getFunctions(true)) {
            if (n >= 10000) {
                break;
            }
            if (n > 0) {
                sb.append(",");
            }
            sb.append("{");
            sb.append("\"name\":\"").append(esc(f.getName())).append("\",");
            sb.append("\"entry\":\"").append(f.getEntryPoint()).append("\",");
            sb.append("\"size\":").append(f.getBody().getNumAddresses()).append(",");
            sb.append("\"params\":").append(f.getParameterCount()).append(",");
            sb.append("\"thunk\":").append(f.isThunk());
            if (ifc != null && n < maxDecompile) {
                try {
                    DecompileResults res = ifc.decompileFunction(f, 60, monitor);
                    if (res != null && res.getDecompiledFunction() != null) {
                        String c = res.getDecompiledFunction().getC();
                        if (c != null && c.length() > 0) {
                            sb.append(",\"pseudo\":\"").append(esc(c)).append("\"");
                        }
                    }
                } catch (Exception e) {
                    sb.append(",\"decompileError\":\"").append(esc(String.valueOf(e.getMessage()))).append("\"");
                }
            }
            sb.append("}");
            n++;
        }
        sb.append("]}");

        try (Writer w = new OutputStreamWriter(new FileOutputStream(outPath), "UTF-8")) {
            w.write(sb.toString());
        }
        if (ifc != null) {
            ifc.dispose();
        }
        println("REHUB_GHIDRA_DUMP_OK " + outPath + " functions=" + n);
    }

    private static String esc(String s) {
        if (s == null) {
            return "";
        }
        StringBuilder b = new StringBuilder(s.length() + 32);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) {
                        b.append(String.format("\\u%04x", (int) c));
                    } else {
                        b.append(c);
                    }
            }
        }
        return b.toString();
    }
}
