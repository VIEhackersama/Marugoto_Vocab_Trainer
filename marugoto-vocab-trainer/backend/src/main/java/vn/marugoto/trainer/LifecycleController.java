package vn.marugoto.trainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@RestController
@RequestMapping("/api/lifecycle")
public class LifecycleController {
    private static final Logger log = LoggerFactory.getLogger(LifecycleController.class);

    private final Map<String, Long> activeTabs = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean hasConnected = false;
    private volatile long lastHeartbeatTime = 0;
    private ScheduledFuture<?> pendingShutdownFuture = null;

    @RequestMapping(value = "/heartbeat", method = {org.springframework.web.bind.annotation.RequestMethod.GET, org.springframework.web.bind.annotation.RequestMethod.POST})
    public synchronized Map<String, Object> heartbeat(@RequestParam(value = "tabId", defaultValue = "default") String tabId) {
        long now = System.currentTimeMillis();
        hasConnected = true;
        lastHeartbeatTime = now;
        activeTabs.put(tabId, now);

        if (pendingShutdownFuture != null && !pendingShutdownFuture.isDone()) {
            pendingShutdownFuture.cancel(false);
            pendingShutdownFuture = null;
            log.info("Pending shutdown canceled. Tab reconnected: {}", tabId);
        }

        return Map.of(
                "status", "ok",
                "activeTabs", activeTabs.size(),
                "timestamp", now
        );
    }

    @PostMapping("/close")
    public synchronized Map<String, Object> closeTab(@RequestParam(value = "tabId", defaultValue = "default") String tabId) {
        activeTabs.remove(tabId);
        log.info("Tab closed: {}. Remaining active tabs: {}", tabId, activeTabs.size());

        if (activeTabs.isEmpty() && hasConnected) {
            scheduleGracefulShutdown(4000, "Last browser tab closed");
        }

        return Map.of(
                "status", "closing",
                "activeTabs", activeTabs.size()
        );
    }

    @PostMapping("/shutdown")
    public Map<String, String> triggerShutdown() {
        log.info("Explicit shutdown requested via API.");
        scheduleGracefulShutdown(500, "API shutdown request");
        return Map.of("status", "shutting_down");
    }

    @Scheduled(fixedRate = 2000)
    public synchronized void watchdog() {
        if (!hasConnected) {
            return;
        }

        long now = System.currentTimeMillis();
        // Remove stale tabs not heard from in 6 seconds
        activeTabs.entrySet().removeIf(entry -> (now - entry.getValue()) > 6000);

        if (activeTabs.isEmpty() && (now - lastHeartbeatTime) > 6000) {
            if (pendingShutdownFuture == null || pendingShutdownFuture.isDone()) {
                scheduleGracefulShutdown(3000, "No heartbeat from any tab for over 6 seconds");
            }
        }
    }

    private synchronized void scheduleGracefulShutdown(long delayMs, String reason) {
        if (pendingShutdownFuture != null && !pendingShutdownFuture.isDone()) {
            return;
        }

        log.info("Scheduling application termination in {}ms. Reason: {}", delayMs, reason);
        pendingShutdownFuture = scheduler.schedule(() -> {
            log.info("Executing application shutdown now: {}", reason);
            killFrontendViteProcess();
            try {
                Thread.sleep(300);
            } catch (InterruptedException ignored) {}
            System.exit(0);
        }, delayMs, TimeUnit.MILLISECONDS);
    }

    private void killFrontendViteProcess() {
        try {
            // Terminate any process listening on Vite port 5173
            new ProcessBuilder(
                    "cmd.exe",
                    "/c",
                    "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %a"
            ).start();
        } catch (Exception e) {
            log.warn("Could not cleanly terminate frontend process on port 5173: {}", e.getMessage());
        }
    }
}
