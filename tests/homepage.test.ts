import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("public homepage", () => {
  it("welcomes visitors and distinguishes new and existing applicants", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain("Welcome to");
    expect(markup).toContain("CYON Connect");
    expect(markup).toContain("SS Joachim and Anne Parish, Ijegun");
    expect(markup).toContain("New applicant");
    expect(markup).toContain("Existing applicant");
    expect(markup).toContain("Create an applicant account");
    expect(markup).toContain("Verify your email and sign in");
    expect(markup).toContain("Complete your membership application");
    expect(markup).toContain("Submit your application for parish review");
    expect(markup).toContain("It does not mean that membership has been approved.");
  });

  it("links applicants to the existing registration and sign-in routes", () => {
    const markup = renderToStaticMarkup(createElement(HomePage));

    expect(markup).toContain('href="/applicant/register"');
    expect(markup).toContain('href="/applicant/sign-in"');
    expect(markup).toContain("Create Applicant Account");
    expect(markup).toContain("Applicant Sign In");
  });
});
