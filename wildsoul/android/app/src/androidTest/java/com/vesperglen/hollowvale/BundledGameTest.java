package com.vesperglen.hollowvale;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Verifies that the real offline web build was bundled into the installed Android app. */
@RunWith(AndroidJUnit4.class)
public class BundledGameTest {
    @Test
    public void gameAssetsAreBundledOffline() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.vesperglen.hollowvale", context.getPackageName());
        try (InputStream stream = context.getAssets().open("public/index.html")) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            String html = new String(output.toByteArray(), StandardCharsets.UTF_8);
            assertTrue(html.contains("Vesperglen"));
        }
    }
}
