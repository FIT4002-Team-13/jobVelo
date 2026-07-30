import { render, screen } from "@testing-library/react";
import Logo from "../components/common/Logo";

test("renders the Smart Recruit logo", () => {
  render(<Logo />);
  expect(screen.getByAltText("Smart Recruit")).toBeInTheDocument();
});

test("applies custom className", () => {
  render(<Logo imgClassName="h-8 w-auto" />);
  expect(screen.getByAltText("Smart Recruit")).toHaveClass("h-8");
});
