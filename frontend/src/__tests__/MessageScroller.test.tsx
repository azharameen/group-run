import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageScroller } from "@/components/ui/message-scroller";

describe("MessageScroller", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("renders children correctly", () => {
		render(
			<MessageScroller>
				<div>Test Message 1</div>
				<div>Test Message 2</div>
			</MessageScroller>
		);

		expect(screen.getByText("Test Message 1")).toBeInTheDocument();
		expect(screen.getByText("Test Message 2")).toBeInTheDocument();
	});

	test("uses scrollTo on scroll container when children update without invoking scrollIntoView", () => {
		const scrollToMock = vi.fn();
		const originalScrollTo = HTMLElement.prototype.scrollTo;
		HTMLElement.prototype.scrollTo = scrollToMock;

		const { rerender } = render(
			<MessageScroller autoScroll={true}>
				<div>Message 1</div>
			</MessageScroller>
		);

		rerender(
			<MessageScroller autoScroll={true}>
				<div>Message 1</div>
				<div>Message 2</div>
			</MessageScroller>
		);

		expect(scrollToMock).toHaveBeenCalledWith({
			top: expect.any(Number),
			behavior: "smooth",
		});

		HTMLElement.prototype.scrollTo = originalScrollTo;
	});
});
