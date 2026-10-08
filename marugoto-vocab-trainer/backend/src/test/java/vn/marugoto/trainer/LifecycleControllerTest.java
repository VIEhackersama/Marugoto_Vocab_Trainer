package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LifecycleControllerTest {
    private final ScheduledExecutorService scheduler = mock(ScheduledExecutorService.class);
    private final ScheduledFuture<?> pending = mock(ScheduledFuture.class);
    private final Runnable terminate = mock(Runnable.class);
    private final LifecycleController controller = new LifecycleController(scheduler, terminate);

    @AfterEach
    void cleanup() { controller.destroy(); }

    @Test
    void launcherStatusRequestsDoNotRegisterATabOrExtendItsHeartbeat() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(get("/api/lifecycle/status")).andExpect(status().isOk());
        assertEquals(0, controller.status().get("activeTabs"));
        assertEquals(false, controller.status().get("hasConnected"));
        assertEquals(0L, controller.status().get("lastHeartbeatTime"));

        controller.heartbeat("browser-tab");
        var before = controller.status();
        mvc.perform(get("/api/lifecycle/status")).andExpect(status().isOk());
        mvc.perform(get("/api/lifecycle/status")).andExpect(status().isOk());
        assertEquals(before, controller.status());
        assertEquals(1, controller.status().get("activeTabs"));
    }

    @Test
    void closingOneOfTwoTabsDoesNotScheduleShutdown() {
        controller.heartbeat("first");
        controller.heartbeat("second");
        controller.closeTab("first");
        assertEquals(1, controller.status().get("activeTabs"));
        verifyNoInteractions(scheduler, terminate);
    }

    @Test
    void reloadOrReconnectCancelsLastTabShutdown() {
        doReturn(pending).when(scheduler).schedule(any(Runnable.class), anyLong(), eq(TimeUnit.MILLISECONDS));
        controller.heartbeat("old-page");
        controller.closeTab("old-page");
        verify(scheduler).schedule(any(Runnable.class), eq(15000L), eq(TimeUnit.MILLISECONDS));
        controller.heartbeat("new-page");
        verify(pending).cancel(false);
        verifyNoInteractions(terminate);
    }

    @Test
    void duplicateOrUnknownCloseDoesNotScheduleShutdown() {
        controller.closeTab("unknown");
        verifyNoInteractions(scheduler, terminate);
    }

    @Test
    void explicitShutdownRunsTerminationCallback() {
        var callback = org.mockito.ArgumentCaptor.forClass(Runnable.class);
        controller.triggerShutdown();
        verify(scheduler).schedule(callback.capture(), eq(500L), eq(TimeUnit.MILLISECONDS));
        callback.getValue().run();
        verify(terminate).run();
    }
}
