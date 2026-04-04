import { logger } from '../logger';
import LLMClient from './LLMClient';

export interface LLMTool {
    id: string;
    whenToUseIt: string;
    toolFunction: Function;
    toolFunctionDefinition: string;
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

interface ToolCallStrategyStep {
    step: number;
    action: string;
    toolId?: string;
    args?: Record<string, any>;
    inputForNextStep?: string;
}

export class LLMToolOrchestrator {
    private agents: LLMTool[];
    private orchestratorRole: string;

    constructor(orchestratorRole: string) {
        this.agents = [];
        this.orchestratorRole = orchestratorRole;
    }

    public addTool(id: string, toolFunction: Function, whenToUseIt: string): void {
        const tool: LLMTool = {
            id, toolFunction, whenToUseIt,
            toolFunctionDefinition: toolFunction.toString(),
            parameters: this.generateParamList(toolFunction)
        };
        this.agents.push(tool);
    }

    public async handleUserRequest(userInput: string): Promise<string> {
        // Build a human-readable description of available tools
        const toolsDescription = this.generateToolDescription();
        let strategyPrompt = [
            `Your role: ${this.orchestratorRole}`,
            "You will use the available tools and prepare a strategy for fulfilling the user's request.",
            "Available tools:",
            toolsDescription,
            "",
            "Given the user's request below, respond with a single JSON object with one of the following actionable structure:",
            '{numberOfSteps: <number>, steps: [<step1>, <step2>, ...]}',
            "",
            "Only return valid JSON. Do not return any extra text.",
            `User request: ${userInput}`
        ].join('\n');
        const strategy = await LLMClient.generateText(strategyPrompt);
        const strategyJson = this.extractFirstJson<ToolCallStrategy>(strategy);
        logger.info(`Received tool call strategy from LLM ${JSON.stringify(strategyJson)}`);
        if (strategyJson.numberOfSteps <= 0 || !strategyJson.steps || strategyJson.steps.length === 0) {
            logger.info(`No actionable items found in the strategy.`);
            return ""
        }

        let solutionPrompt = [
            "You are an assistant that provides solutions based on the user's request and the available tools.",
            "Available tools:",
            toolsDescription,
            "",
            `User request: ${userInput}`,
            "",
            `Proposed solution steps: ${JSON.stringify(strategyJson.steps)}`,
            "",
            "Generate an actionable JSON as follows for the proposed solution steps one at a time. As soon as one step is complete, its result will be added to this prompt and we will go forward to the next step in a loop.",
            '1) {"step": <step number>, "action":"call_tool", "toolId":"<tool id>", "args": { "<paramName>": <value>, ... }}',
            '2) {"step": <step number>, "action":"move_to_next_step", "inputForNextStep":"<input for next step>"}',
            "",
            "Return EXACTLY ONE valid JSON. Do not return any extra text.",
        ].join('\n');
        let stepResult: any;
        for (let step = 1; step <= strategyJson.numberOfSteps; step++) {
            solutionPrompt += `Actionable JSON for Step ${step}: `;
            const stepSolution = await LLMClient.generateText(solutionPrompt);
            const stepDecision = this.extractFirstJson<ToolCallStrategyStep>(stepSolution);
            logger.info(`Received solution for step ${step} from LLM ${JSON.stringify(stepDecision)}`);
            stepResult = await this.takeActionOnSolutionStep(stepDecision);
            solutionPrompt += `\nResult of Step ${step}: ${JSON.stringify(stepResult)}`;
        }

        return JSON.stringify(stepResult);
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
                return `- id: "${t.id}", whenToUseIt: "${t.whenToUseIt}", parameters: [${params}]`;
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

    private async takeActionOnSolutionStep(step: ToolCallStrategyStep): Promise<any> {
        logger.info(`Taking action for step ${step.step} with action ${step.action}`);
        if (step.action === 'call_tool' && step.toolId) {
            const tool = this.agents.find((a) => a.id === step.toolId);
            if (!tool) {
                let message = `Tool with id ${step.toolId} not found`;
                logger.error(message);
                return message;
            }
            try {
                const argsArray = tool.parameters?.map((p) => step.args ? step.args[p.name] : undefined) || [];
                logger.info(`Calling tool ${tool.id} for step ${step.step} with args ${JSON.stringify(argsArray)}`);
                const rawResult = await Promise.resolve(tool.toolFunction.apply(null, argsArray));
                let message = `Result of step ${step.step}: ${JSON.stringify(rawResult)}`;
                logger.info(message);
                return message;
            } catch (err) {
                let message = `Error executing tool ${tool.id} for step ${step.step}: ${(err as Error).message || err}`;
                logger.error(message);
                return message;
            }
        } else if (step.action === 'move_to_next_step') {
            let message = `Moving to next step after step ${step.step}`;
            logger.info(message);
            return `Input for next step after step ${step.step}: ${step.inputForNextStep}`;
        } else {
            let message = `Unrecognized action "${step.action}" for step ${step.step}`;
            logger.error(message);
            return message;
        }
    }
}