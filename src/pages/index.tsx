import React, { Dispatch, SetStateAction } from "react";
import { Provider as StyletronProvider } from "styletron-react";
import { LightTheme, BaseProvider, styled } from "baseui";
import * as ButtonGroup from "baseui/button-group";
import * as Button from "baseui/button";
import * as FormControl from "baseui/form-control";
import * as Accordion from "baseui/accordion";

const isBrowser = typeof window !== "undefined";

export default function Index() {
  const [engine, setEngine] = React.useState(null);

  const [selected, setSelected] = useLocalStorage({
    key: "bet-0",
    defaultValue: defaultBet,
  });

  React.useEffect(() => {
    // Load the `styletron-engine-atomic` package dynamically.
    // Reason: It requires use of `document`, which is not available
    // outside the browser, so we need to wait until it successfully loads.
    // Source: https://www.gatsbyjs.org/docs/debugging-html-builds/
    import("styletron-engine-atomic").then((styletron) => {
      const clientEngine = new styletron.Client();
      setEngine(clientEngine);
    });
  }, []);

  if (!engine) return null;

  const result = prepareResult(selected);

  function handleClick(i: number, value: string) {
    const stringArr = Array.from(selected);
    stringArr[i] = value;
    setSelected(stringArr.join(""));
  }

  return (
    <StyletronProvider value={engine}>
      <BaseProvider theme={LightTheme}>
        <Wrapper>
          <div>
            {matches.map((match, i) => {
              return (
                <FormControl.FormControl
                  key={i}
                  label={`${i + 1}: ${match.label}`}
                >
                  <ButtonGroup.ButtonGroup>
                    <Button.Button
                      isSelected={selected[i] === "1"}
                      onClick={() => handleClick(i, "1")}
                    >
                      1
                    </Button.Button>
                    <Button.Button
                      isSelected={selected[i] === "X"}
                      onClick={() => handleClick(i, "X")}
                    >
                      x
                    </Button.Button>
                    <Button.Button
                      isSelected={selected[i] === "2"}
                      onClick={() => handleClick(i, "2")}
                    >
                      2
                    </Button.Button>
                  </ButtonGroup.ButtonGroup>
                </FormControl.FormControl>
              );
            })}
          </div>
        </Wrapper>
      </BaseProvider>
    </StyletronProvider>
  );
}

function formatLinenumbers(lines: number[]) {
  let res = lines?.slice(0, Math.min(lines.length, 10))?.join(",") ?? "";
  if (lines?.length > 10) {
    res += "...";
  }
  return res;
}

function prepareResult(currentStatus: string) {
  const result: { [k: number]: number[] } = {};

  tips.forEach((bets, betsIndex) => {
    let correct = 0;
    for (let i = 0; i < bets.length; i++) {
      const bet = bets[i];
      const curr = currentStatus[i];
      if (bet === curr) {
        correct++;
      }
    }
    let entry = result[correct];
    if (entry == null) {
      entry = [];
    }
    entry.push(betsIndex);
    result[correct] = entry;
  });
  return result;
}

const matches = [
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
  { label: "" },
];

const copy =
  "11112111X21212.111121X21112X3.111212XX2111X4.11X112X11211X5.11XXX21X12X2X6.11X221X11X2217.11211XX11X11X8.11211211221219.1121X11112X2210.112121112212111.112121211112112.11212X121212113.11212211X212214.112122X1112X115.112XX1111212116.112XXX1X1212117.11221X111112118.1X11111X1222119.1X21211X212X220.1X2XX1111222121.1X2XX1211X1X122.1X2X2X111X12123.1211X21X1112124.121X121112X2X25.12X1X2121122126.1221111X1212127.12211X111212128.1221X11X1112129.1221221122X2130.122X2111112X131.1222X2111112232.X1111X11112X133.X111X1X112X1134.X11XX111XXX2135.X1121X1X1111X36.X1X1XX112212137.X1X1XXX22X12138.X1XXXX121212139.X1X221X11122140.X12112111211141.X121X1222111X42.X12121112XXX143.X12121X11112244.X12121X112X2145.X12121211212146.X1212211111XX47.XX11122212X1148.XXXX22111211X49.XX2122111212250.XX2122X21211151.X2X1XXXX11X1152.X2X12XX122X1X53.X2X122XX1212154.211X1XX11X12155.211XXX212X1X156.211XX21X111X157.211X222X12XX158.21X1111X1122X59.21X1XX1X1121160.21X12X1112X2261.21X122X11212162.21XXX2X1X112163.21XX22211X11164.21X22XX11212165.2121XX11X112166.212121121111167.212121X11212268.2121221X1112269.212X22111X22170.2XX12X111121171.2X211211X2X2272.2X2121111X12173.2X212112X112174.221122XX1211175.22X11X1112221";

const tips = copy
  .toUpperCase()
  .split(".")
  .map((tip) => tip.slice(0, 13));
const defaultBet = "1111111111111";

function useLocalStorage({
  key,
  defaultValue,
}: {
  key: string;
  defaultValue: string;
}): [string, Dispatch<SetStateAction<string>>] {
  const [localStorage, setLocalStorage] = React.useState(() => {
    return getLocalStorageObject({ key, defaultValue });
  });

  React.useEffect(() => {
    if (localStorage) {
      window.localStorage.setItem(key, localStorage);
    }
  }, [localStorage, key]);

  return [localStorage, setLocalStorage];
}

function getLocalStorageObject({
  key,
  defaultValue,
}: {
  key: string;
  defaultValue: string;
}) {
  let localStorageJson = null;
  if (isBrowser) {
    localStorageJson = window.localStorage.getItem(key);
  }
  return localStorageJson ? localStorageJson : defaultValue;
}

const Wrapper = styled("div", {
  display: "flex",
  gap: "20px",
});

const ResultWrapper = styled("div", {
  minWidth: "500px",
});

const CorrectBet = styled("span", ({ $theme }) => ({
  minWidth: "500px",
  color: $theme.colors.positive,
}));
