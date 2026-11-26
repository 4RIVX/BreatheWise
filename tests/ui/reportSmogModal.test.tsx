// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { ReportSmogModal } from "../../src/components/ReportSmogModal";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderModal(
  overrides: Partial<React.ComponentProps<typeof ReportSmogModal>> = {}
) {
  const props: React.ComponentProps<typeof ReportSmogModal> = {
    open: true,
    defaultCity: "Chennai",
    defaultState: "Tamil Nadu",
    isSignedIn: true,
    onSignIn: vi.fn(async () => {}),
    getIdToken: vi.fn(async () => "test-token"),
    onClose: vi.fn(),
    onSubmit: vi.fn(async () => {}),
    ...overrides,
  };

  return { ...render(<ReportSmogModal {...props} />), props };
}

function fillRequiredReportFields() {
  fireEvent.change(
    screen.getByLabelText("Approximate Location (Neighbourhood / Landmark)"),
    { target: { value: "Guindy Industrial Estate" } }
  );
  fireEvent.change(screen.getByLabelText("Observation Description"), {
    target: { value: "Visible smoke from roadside burning." },
  });
}

function stubSuccessfulImageCanvas() {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,compressed"
  );

  class MockImage {
    width = 800;
    height = 600;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      this.onload?.();
    }
  }

  vi.stubGlobal("Image", MockImage);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ReportSmogModal submission and photo handling", () => {
  it("prompts signed-out users to authenticate", async () => {
    const onSignIn = vi.fn(async () => {});
    renderModal({ isSignedIn: false, onSignIn });

    fireEvent.click(
      screen.getByRole("button", { name: "Sign in with Google" })
    );

    await waitFor(() => expect(onSignIn).toHaveBeenCalledOnce());
  });

  it("submits normalized report fields and closes on success", async () => {
    const onSubmit = vi.fn(async () => {});
    const onClose = vi.fn();
    const { props } = renderModal({ onSubmit, onClose });
    fillRequiredReportFields();
    fireEvent.change(screen.getByLabelText("Observation Time"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Severe" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "Chennai",
        state: "Tamil Nadu",
        approximateLocation: "Guindy Industrial Estate",
        sourceCategory: "Waste burning",
        severity: "Severe",
        description: "Visible smoke from roadside burning.",
        observedTimeLabel: "Just now",
      })
    );
    expect(onClose).toHaveBeenCalledOnce();
    expect(props.onClose).toBe(onClose);
  });

  it("keeps the form open and associates submission failures with fields", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("Firestore write denied");
    });
    renderModal({ onSubmit });
    fillRequiredReportFields();
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("Firestore write denied");
    expect(screen.getByLabelText("Observation Description")).toHaveAttribute(
      "aria-describedby",
      error.id
    );
    expect(screen.getByRole("button", { name: "Submit Report" })).toBeEnabled();
  });

  it("uploads a sanitized photo and includes its server URL in the report", async () => {
    stubSuccessfulImageCanvas();
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ photoDataUrl: "data:image/jpeg;base64,server-verified" })
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSubmit = vi.fn(async () => {});
    const getIdToken = vi.fn(async () => "upload-token");
    renderModal({ onSubmit, getIdToken });

    const photo = new File(["valid image bytes"], "smog.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText(/Optional Photo/i), {
      target: { files: [photo] },
    });

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Verified image ready (EXIF & GPS metadata removed)."
      )
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/smog-photo",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer upload-token",
        },
      })
    );

    fillRequiredReportFields();
    fireEvent.click(screen.getByRole("button", { name: "Submit Report" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        photoDataUrl: "data:image/jpeg;base64,server-verified",
      })
    );
  });

  it("rejects photo uploads when no authentication token is available", async () => {
    stubSuccessfulImageCanvas();
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    renderModal({ getIdToken: vi.fn(async () => null) });

    fireEvent.change(screen.getByLabelText(/Optional Photo/i), {
      target: {
        files: [new File(["image"], "smog.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign in with Google first to upload a photo."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
