import React, { Dispatch, SetStateAction } from "react";
import { Client as Styletron } from "styletron-engine-atomic";
import { Provider as StyletronProvider } from "styletron-react";
import { LightTheme, BaseProvider, styled } from "baseui";
import * as ButtonGroup from "baseui/button-group";
import * as Button from "baseui/button";
import * as FormControl from "baseui/form-control";
import * as Accordion from "baseui/accordion";
import * as Table from "baseui/table-semantic";

import JSONData from "../../content/test.json";

const isBrowser = typeof window !== "undefined";

export default function Index() {
  const [selected, setSelected] = useLocalStorage({
    key: "bet-0",
    defaultValue: defaultBet,
  });
  const [engine, setEngine] = React.useState(null);

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

  const tips = JSONData.bets.map((inden) =>
    Array.from(inden)
      .map((x) => convertBet(x))
      .join("")
  );
  const teams = JSONData.teams;
  const result = prepareResult(selected, tips);

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
                  label={`${i + 1}: ${teams[i][1]} vs ${teams[i][2]}`}
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
          <ResultWrapper>
            <Accordion.Accordion accordion={false}>
              {[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0].map((correct) => {
                const lineNos = result[correct];
                return (
                  <Accordion.Panel
                    expanded={
                      +correct >= 10 && lineNos != null && lineNos.length > 0
                    }
                    title={`${correct} rigtige [${
                      lineNos?.length ?? 0
                    }] ${formatLinenumbers(lineNos)}`}
                  >
                    <Table.Table
                      size={Table.SIZE.compact}
                      divider={Table.DIVIDER.vertical}
                      overrides={{
                        TableHeadCell: {
                          style: ({ $theme }) => ({
                            padding: "5px",
                            textAlign: "center",
                          }),
                        },
                        TableBodyCell: {
                          style: ({ $theme }) => ({
                            padding: "5px",
                            textAlign: "center",
                          }),
                        },
                      }}
                      columns={[
                        "Nr",
                        ...teams.map((match, matchID) => matchID + 1),
                      ]}
                      data={lineNos?.map((lineNo) => [
                        lineNo + 1,
                        ...Array.from(tips[lineNo]).map((tip, tipIndex) => {
                          const correct = selected[tipIndex] === tip;
                          if (correct) {
                            return <CorrectBet>{tip} </CorrectBet>;
                          }
                          return <IncorrectBet>{tip} </IncorrectBet>;
                        }),
                      ])}
                    />
                  </Accordion.Panel>
                );
              })}
            </Accordion.Accordion>
          </ResultWrapper>
        </Wrapper>
      </BaseProvider>
    </StyletronProvider>
  );
}

function formatLinenumbers(lines: number[]) {
  let res =
    lines
      ?.slice(0, Math.min(lines.length, 10))
      .map((line) => line + 1)
      ?.join(",") ?? "";
  if (lines?.length > 10) {
    res += "...";
  }
  return res;
}

function prepareResult(currentStatus: string, tips: string[]) {
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

function convertBet(bet_indency: string) {
  switch (bet_indency) {
    case "0":
      return "1";
    case "1":
      return "X";
    case "2":
      return "2";
    default:
      return "U";
  }
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
  color: $theme.colors.positive,
}));

const IncorrectBet = styled("span", ({ $theme }) => ({
  color: $theme.colors.negative,
}));
