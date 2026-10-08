package vn.marugoto.trainer;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LifecycleControllerTest {
    @Test
    void launcherStatusRequestsDoNotRegisterATabOrExtendItsHeartbeat() throws Exception {
        var controller = new LifecycleController();
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
}
