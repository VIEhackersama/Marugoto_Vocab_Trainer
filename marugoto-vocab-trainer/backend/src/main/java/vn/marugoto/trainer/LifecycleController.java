package vn.marugoto.trainer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.annotation.PreDestroy;
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
    private final ScheduledExecutorService scheduler;
    private final Runnable terminate;
    private volatile boolean hasConnected = false;
    private volatile long lastHeartbeatTime = 0;
    private ScheduledFuture<?> pendingShutdownFuture = null;

    public LifecycleController() {
        this(Executors.newSingleThreadScheduledExecutor(), () -> System.exit(0));
    }

    LifecycleController(ScheduledExecutorService scheduler, Runnable terminate) {
        this.scheduler = scheduler;
        this.terminate = terminate;
    }

    @PreDestroy
    public void destroy() {
        scheduler.shutdownNow();
    }

    // The launcher can observe liveness without registering itself as a browser tab.
    @GetMapping("/status")
    public synchronized Map<String, Object> status() {
        return Map.of(
                "status", "ok",
                "activeTabs", activeTabs.size(),
                "hasConnected", hasConnected,
                "lastHeartbeatTime", lastHeartbeatTime
        );
    }

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
        boolean knownTab = activeTabs.remove(tabId) != null;
        log.info("Tab closed: {}. Remaining active tabs: {}", tabId, activeTabs.size());

        if (knownTab && activeTabs.isEmpty() && hasConnected) {
            scheduleGracefulShutdown(15000, "Last browser tab closed");
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

    // A missing heartbeat cannot distinguish a closed tab from browser throttling,
    // a frozen page or computer sleep. Keep registered tabs until an explicit close.

    private synchronized void scheduleGracefulShutdown(long delayMs, String reason) {
        if (pendingShutdownFuture != null && !pendingShutdownFuture.isDone()) {
            return;
        }

        log.info("Scheduling application termination in {}ms. Reason: {}", delayMs, reason);
        pendingShutdownFuture = scheduler.schedule(() -> {
            log.info("Executing application shutdown now: {}", reason);
            terminate.run();
        }, delayMs, TimeUnit.MILLISECONDS);
    }

}
