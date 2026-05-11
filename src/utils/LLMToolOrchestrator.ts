import { log } from 'console';
import { logger } from '../logger';
import LLMClient from './LLMClient';

export interface LLMTool {
    id: string;
    whenToUseIt: string;
    toolFunction: Function;
    toolSignature: string;
    parameters?: FunctionParameter[];
}

interface FunctionParameter {
    name: string;
    type: string;
    required: boolean;
}

interface ToolCallStrategy {
    numberOfSteps: number;
    steps: Array<string>;
}

interface ToolCallSteps {
    actionableSteps: Array<ToolCallStrategyStep>;
}

interface ToolCallStrategyStep {
    step: number;
    action: string;
    toolId?: string;
    args?: Record<string, any>;
}

export class LLMToolOrchestrator {
    private agents: LLMTool[];
    private orchestratorRole: string;

    constructor(orchestratorRole: string) {
        this.agents = [];
        this.orchestratorRole = orchestratorRole;
        logger.info(`LLMToolOrchestrator initialized with role: ${orchestratorRole}`);
    }

    public addTool(id: string, toolFunction: Function, whenToUseIt: string): void {
        const tool: LLMTool = {
            id, toolFunction, whenToUseIt,
            toolSignature: toolFunction.toString().split('{')[0].trim(), // Get the function signature (up to the opening brace)
            parameters: this.generateParamList(toolFunction)
        };
        this.agents.push(tool);
        logger.info(`Tool added: ${JSON.stringify({ id, whenToUseIt, parameters: tool.parameters })}`);
    }

    public async handleUserRequest(userInput: string): Promise<string> {
        // Build a human-readable description of available tools
        const toolsDescription = this.generateToolDescription();
        const strategyJson = await this.prepareStrategy(toolsDescription, userInput);
        logger.info(`Received tool call strategy from LLM ${JSON.stringify(strategyJson)}`);
        if (strategyJson.numberOfSteps <= 0 || !strategyJson.steps || strategyJson.steps.length === 0) {
            logger.info(`No actionable items found in the strategy.`);
            return ""
        }

        const toolCallsJson = await this.prepareSteps(toolsDescription, strategyJson);
        if (toolCallsJson.actionableSteps.length === 0) {
            logger.info(`No actionable items found in the tool calls.`);
            return ""
        }
        const stepResults: Record<string, any> = {};
        let lastResult = "";
        for (let step = 0; step < toolCallsJson.actionableSteps.length; step++) {
            lastResult = await this.takeActionOnSolutionStep(toolCallsJson.actionableSteps[step], stepResults);
            stepResults[`outputOfStep${step}`] = lastResult;
        }

        return lastResult;
    }

    private async prepareSteps(toolsDescription: string, strategyJson: ToolCallStrategy) {
        let solutionPrompt = [
            "You are an assistant that provides solutions based on the user's request and the available tools.",
            "Available tools:",
            toolsDescription,
            "",
            `Proposed solution steps: ${JSON.stringify(strategyJson.steps)}`,
            "",
            "Generate an actionable JSON as follows for the proposed solution steps one at a time. As soon as one step is complete, its result will be added to this prompt and we will go forward to the next step in a loop.",
            `{
                "actionableSteps":[
                    {"step": 0, "action":"call_tool", "toolId":"<tool id>", "args": { "<paramName1>": <value>, ... }}] },
                    {"step": 1, "action":"call_tool", "toolId":"<tool id>", "args": { "<paramName1>": <outputOfStep0>, ... }},
                    {"step": 2, "action":"call_tool", "toolId":"<tool id>", "args": { "<paramName1>": <outputOfStep0>, "<paramName2>": <outputOfStep1>, "<paramName3>": <value>, ... }},
                ]
            }`,
            "",
            "Return EXACTLY ONE valid JSON. Do not return any extra text.",
            "System:"
        ].join('\n');
        const toolCalls = await LLMClient.generateText(solutionPrompt);
        const toolCallsJson = this.extractFirstJson<ToolCallSteps>(toolCalls);
        return toolCallsJson;
    }

    private async prepareStrategy(toolsDescription: string, userInput: string) {
        let strategyPrompt = [
            `Your role: ${this.orchestratorRole}`,
            "You will use the available tools and prepare a strategy for fulfilling the user's request.",
            "Available tools:",
            toolsDescription,
            "",
            "Given the chat history below, respond with a single JSON object with one of the following actionable structure:",
            '{numberOfSteps: <number>, steps: [<step1>, <step2>, ...]}',
            "",
            "Only return valid JSON. Do not return any extra text.",
            `Chat history: ${userInput}`,
            `System:`
        ].join('\n');
        const strategy = await LLMClient.generateText(strategyPrompt);
        const strategyJson = this.extractFirstJson<ToolCallStrategy>(strategy);
        return strategyJson;
    }

    private generateParamList(
        fn: Function,
    ): FunctionParameter[] {
        const fnStr = fn.toString();        
        // Extract parameters from function signature
        const match = fnStr.match(/\(([^)]*)\)/);
        const paramStr = match ? match[1] : '';
        
        const parameters: FunctionParameter[] = paramStr
            .split(',')
            .map((param) => param.trim())
            .filter((p) => p.length > 0)
            .map((param) => {
                const [nameAndType, defaultValue] = param.split('=').map((s) => s.trim());
                const [name, type] = nameAndType.split(':').map((s) => s.trim());
                return {
                    name,
                    type: type || 'any',
                    required: defaultValue === undefined,
                };
            });

        return parameters;
    }

    private generateToolDescription(): string {
        const toolsDescription = this.agents
            .map((t) => {
                const params = (t.parameters || [])
                    .map((p) => `${p.name}${p.required ? '' : '?'}: ${p.type}`)
                    .join(', ');
                return `- id: "${t.id}", toolSignature: "${t.toolSignature}", parameters: [${params}], whenToUseIt: "${t.whenToUseIt}"`;
            })
            .join('\n');
        logger.info(`Generated tools description for LLM: ${toolsDescription}`);
        return toolsDescription;
    }

    private extractFirstJson<Type>(text: string): Type {
        try {
            const firstBrace = text.indexOf('{');
            const lastBrace = text.lastIndexOf('}');
            return JSON.parse(text.slice(firstBrace, lastBrace + 1)) as Type;
        } catch (err) {
            logger.error('Failed to extract JSON from text', { text, error: err });
            throw err;
        }
    }

    private async takeActionOnSolutionStep(step: ToolCallStrategyStep, stepResult: Record<string, any>): Promise<any> {
        logger.info(`Taking action for step ${step.step} with action ${step.action}`);
        if (step.action === 'call_tool' && step.toolId) {
            const tool = this.agents.find((a) => a.id === step.toolId);
            if (!tool) {
                let message = `Tool with id ${step.toolId} not found`;
                logger.error(message);
                return message;
            }
            const argExtractPrompt = [
                `You are an assistant that extracts and formats arguments for tool calls.`,
                ``,
                `A JSON object with required arguments are provided to you`,
                `  Required arguments: ${JSON.stringify(step.args)}`,
                ``,
                `1. If the required arguments has the values directly provided in the "Required arguments", then use those values.`,
                `2. If the required arguments needs to be filled with the output of previous steps, then MUST set the value of the parameter as outputOfStepX where X is the step number from the previous steps' results. Eg: "outputOfStep0", "outputOfStep1", etc.`,
                ``,
                `Extract and format the arguments as a JSON object with key-value pairs matching the required argument names and values.`,
                `Return EXACTLY ONE valid JSON object with the extracted arguments. Do not return any extra text.`
            ].join('\n');
            try {
                const extractedArgsStr = await LLMClient.generateText(argExtractPrompt);
                const extractedArgs = this.extractFirstJson<Record<string, any>>(extractedArgsStr);
                // Enrich the extracted arguments with the results from previous steps if needed
                Object.keys(extractedArgs).forEach((k) => {
                    const value = extractedArgs[k];
                    if (typeof value === 'string' && value.startsWith('outputOfStep')) {
                        const stepKey = value;
                        extractedArgs[k] = stepResult[stepKey];
                    }
                });
                const argsArray = tool.parameters?.map((p) => extractedArgs[p.name]) || [];
                logger.info(`Calling tool ${tool.id} for step ${step.step} with args ${JSON.stringify(argsArray)}`);
                const rawResult = await Promise.resolve(tool.toolFunction.apply(null, argsArray));
                let message = `Result of step ${step.step}: ${JSON.stringify(rawResult)}`;
                logger.info(message);
                return rawResult;
            } catch (err) {
                let message = `Error executing tool ${tool.id} for step ${step.step}: ${(err as Error).message || err}`;
                logger.error(message);
                return message;
            }
        } else {
            let message = `Unrecognized action "${step.action}" for step ${step.step}`;
            logger.error(message);
            return message;
        }
    }
}