
import Showcase from "./showcase";
import ShowcaseMobile from "./showcaseMobile";
import ShowcaseVirtualAsst from "./showcaseVirtualAsst";
import ShowcaseSalesforce from "./showcaseSalesforce";

// demo nav links
$("main").on("click", ".demo-nav a[data-target]", e => {
  e.preventDefault();
  const $el = $(e.currentTarget);
  const { target } = $el.data();
  let link = `/s/${window.jga.api.adviceset.id}/`;
  if (target == "mobile") {
    link += "mobile/";
  } else if (target == "asst") {
    link += "virtual-assistant/";
  } else if (target == "salesforce") {
    link += "salesforce/";
  }
  window.location.href = `${link}${location.search}`;
});

const imports = {
  showcase: Showcase,
  showcaseMobile: ShowcaseMobile,
  showcaseVirtualAsst: ShowcaseVirtualAsst,
  showcaseSalesforce: ShowcaseSalesforce
}

// init appropriate view
// init page-level scripts ... only when defined by in-page HTML
const $pageScript = $("#__init");
if ($pageScript.length) {
  const { pageInit } = $pageScript.data();
  if (!imports[pageInit]) {
    throw new Error("pageInit defined but is not in imports", pageInit);
  }
  new imports[pageInit]().init();
}