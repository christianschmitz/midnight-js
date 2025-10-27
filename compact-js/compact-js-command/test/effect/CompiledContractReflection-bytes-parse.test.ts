/*
 * This file is part of midnight-js.
 * Copyright (C) 2025 Midnight Foundation
 * SPDX-License-Identifier: Apache-2.0
 * Licensed under the Apache License, Version 2.0 (the "License");
 * You may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { join } from 'node:path';

import { FileSystem } from '@effect/platform';
import { type PlatformError } from '@effect/platform/Error';
import { NodeContext } from '@effect/platform-node';
import { describe, it } from '@effect/vitest';
import { type ContractRuntimeError } from '@midnight-ntwrk/compact-js/effect';
import * as CompiledContract from '@midnight-ntwrk/compact-js/effect/CompiledContract';
import { CompiledContractReflection } from '@midnight-ntwrk/compact-js-command/effect';
import { Effect, Layer, String } from 'effect';

import { ensureRemovePath } from './cleanup.js';

const BASE_PATH = join(import.meta.dirname);
const DECLARATION_FILEPATH = join(BASE_PATH, 'contract', 'index.d.ts');
const testLayer: Layer.Layer<
  CompiledContractReflection.CompiledContractReflection
  | NodeContext.NodeContext,
  PlatformError
> = CompiledContractReflection.layer(BASE_PATH).pipe(Layer.provideMerge(NodeContext.layer));

const parseArgumentsTest = (
  argText: string,
  fn: (argsParser: CompiledContractReflection.CompiledContractReflection.AnyArgumentParser)
    => Effect.Effect<any[], ContractRuntimeError.ContractRuntimeError>
) => Effect.gen(function* () {
      const NullContract = (() => ({} as any)) as any;
      const fs = yield* FileSystem.FileSystem;

      yield* fs.makeDirectory(join(BASE_PATH, 'contract'));
      yield* fs.writeFileString(DECLARATION_FILEPATH, String.stripMargin(`
        |export type ImpureCircuits<T> = {
        | circuit(_: any, ${argText}): void;
        |}
        |
        |export declare class Contract<T, W> {
        | initialState(_: any, ${argText}): void;
        |}
      `));

      const contractReflection = yield* CompiledContractReflection.CompiledContractReflection;
      const argsParser = yield* contractReflection.createArgumentParser(
        CompiledContract.make('NullContract', NullContract).pipe(
          CompiledContract.withWitnesses({} as never),
          CompiledContract.withCompiledFileAssets(BASE_PATH)
        )
      );
      return yield* fn(argsParser);
  }).pipe(
    Effect.ensuring(ensureRemovePath(join(BASE_PATH, 'contract')))
  );

describe.sequential('CompiledContractReflection - bytes parsing', () => {
  it('should parse object with bytes property as Bech32m-encoded string', async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const bech32Address = 'mn_addr_undeployed1h3ssm5ru2t6eqy4g3she78zlxn96e36ms6pq996aduvmateh9p9sk96u7s';
      const expected = 'bc610dd07c52f59012a88c2f9f1c5f34cbacc75b868202975d6f19beaf37284b';

      const parsedArgs = yield* parseArgumentsTest(
        'a: { bytes: Uint8Array }',
        (_) => _.parseInitializationArgs([`{ bytes: '${bech32Address}' }`])
      );

      expect(parsedArgs[0].bytes).toBeInstanceOf(Uint8Array);
      const bytesAsHex = Buffer.from(parsedArgs[0].bytes).toString('hex');
      expect(bytesAsHex).toEqual(expected);
    }).pipe(Effect.provide(testLayer)));
  });

  it('should successfully parse object with bytes property as hex string', async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const parsedArgs = yield* parseArgumentsTest(
        'a: { bytes: Uint8Array }',
        (_) => _.parseInitializationArgs(["{ bytes: 'ffffff' }"])
      );

      expect(parsedArgs[0].bytes).toBeInstanceOf(Uint8Array);
      expect(Array.from(parsedArgs[0].bytes)).toEqual([255, 255, 255]);
    }).pipe(Effect.provide(testLayer)));
  });

  it('should parse object with nested bytes property as Bech32m string', async () => {
    await Effect.runPromise(Effect.gen(function* () {
      const bech32Address = 'mn_addr_undeployed1h3ssm5ru2t6eqy4g3she78zlxn96e36ms6pq996aduvmateh9p9sk96u7s';

      const parsedArgs = yield* parseArgumentsTest(
        'a: { data: { bytes: Uint8Array }, label: string }',
        (_) => _.parseInitializationArgs([`{ data: { bytes: '${bech32Address}' }, label: 'test' }`])
      );

      expect(parsedArgs[0].data.bytes).toBeInstanceOf(Uint8Array);
      expect(parsedArgs[0].label).toBe('test');
    }).pipe(Effect.provide(testLayer)));
  });
});
