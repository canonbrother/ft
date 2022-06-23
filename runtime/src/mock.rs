#![cfg(test)]
use super::*;

use core::str::FromStr;
use sp_core::H160;

use frame_support::{
	construct_runtime,
	parameter_types,
	traits::{Everything, ConstU64, GenesisBuild}
};
use sp_runtime::{
	testing::Header,
	traits::{BlakeTwo256, IdentityLookup},
};
use pallet_evm::{EnsureAddressNever, EnsureAddressRoot, IdentityAddressMapping};
use fp_evm::GenesisAccount;
use std::collections::BTreeMap;

pub type AccountId = H160;
pub type Balance = u64;

type UncheckedExtrinsic = frame_system::mocking::MockUncheckedExtrinsic<Test>;
type Block = frame_system::mocking::MockBlock<Test>;

pub const INITIAL_BALANCE: Balance = 1_000_000_000_000_000;

pub fn alice() -> H160 {
	H160::from_str("1000000000000000000000000000000000000001").unwrap()
}

construct_runtime!(
    pub enum Test where
        Block = Block,
        NodeBlock = Block,
        UncheckedExtrinsic = UncheckedExtrinsic,
    {
        System: frame_system::{Pallet, Call, Config, Storage, Event<T>},
        Balances: pallet_balances::{Pallet, Call, Config<T>, Storage, Event<T>},
        Timestamp: pallet_timestamp::{Pallet, Call, Storage, Inherent},
        EVM: pallet_evm::{Pallet, Call, Storage, Config, Event<T>},
    }
);

parameter_types! {
	pub const BlockHashCount: u64 = 250;
}

impl frame_system::Config for Test {
	type BaseCallFilter = Everything;
	type BlockWeights = ();
	type BlockLength = ();
	type Origin = Origin;
	type Call = Call;
	type Index = u64;
	type BlockNumber = u64;
	type Hash = H256;
	type Hashing = BlakeTwo256;
	type AccountId = AccountId;
	type Lookup = IdentityLookup<Self::AccountId>;
	type Header = Header;
	type Event = Event;
	type BlockHashCount = BlockHashCount;
	type DbWeight = ();
	type Version = ();
	type PalletInfo = PalletInfo;
	type AccountData = pallet_balances::AccountData<u64>;
	type OnNewAccount = ();
	type OnKilledAccount = ();
	type SystemWeightInfo = ();
	type SS58Prefix = ();
	type OnSetCode = ();
	type MaxConsumers = frame_support::traits::ConstU32<16>;
}

parameter_types! {
	pub const ExistentialDeposit: u64 = 1;
}
impl pallet_balances::Config for Test {
	type Balance = Balance;
	type DustRemoval = ();
	type Event = Event;
	type ExistentialDeposit = ExistentialDeposit;
	type AccountStore = System;
	type WeightInfo = ();
	type MaxLocks = ();
	type MaxReserves = ();
	type ReserveIdentifier = [u8; 8];
}

impl pallet_timestamp::Config for Test {
	type Moment = u64;
	type OnTimestampSet = ();
	type MinimumPeriod = ConstU64<1>;
	type WeightInfo = ();
}

parameter_types! {
	pub PrecompilesValue: FrontierPrecompiles<Test> = FrontierPrecompiles::<_>::new();
}

impl pallet_evm::Config for Test {
	type FeeCalculator = ();
	type GasWeightMapping = ();
	type CallOrigin = EnsureAddressRoot<AccountId>;
	type WithdrawOrigin = EnsureAddressNever<AccountId>;
	type AddressMapping = IdentityAddressMapping;
	type Currency = Balances;
	type Event = Event;
	type Runner = pallet_evm::runner::stack::Runner<Self>;
	type PrecompilesType = FrontierPrecompiles<Self>;
	type PrecompilesValue = PrecompilesValue;
	type ChainId = ();
	type OnChargeTransaction = ();
	type BlockGasLimit = BlockGasLimit;
	type BlockHashMapping = pallet_evm::SubstrateBlockHashMapping<Self>;
	type FindAuthor = ();
	// type WeightInfo = ();
}

pub(crate) struct ExtBuilder {
	// Accounts endowed with balances
    balances: Vec<(AccountId, Balance)>,
}

impl Default for ExtBuilder {
    fn default() -> Self {
        ExtBuilder {
			balances: vec![],
		}
    }
}

impl ExtBuilder {
    pub(crate) fn build(self) -> sp_io::TestExternalities {
        let mut t = frame_system::GenesisConfig::default()
            .build_storage::<Test>()
            .expect("Test ExtBuilder setup successfully");
        
        pallet_balances::GenesisConfig::<Test> {
            balances: vec![(H160::default(), INITIAL_BALANCE)],
        }
        .assimilate_storage(&mut t)
        .expect("Pallet balances storage can be assimilated");
        
		// This is the simplest bytecode to revert without returning any data.
		// We will pre-deploy it under all of our precompiles to ensure they can be called from
		// within contracts.
		// (PUSH1 0x00 PUSH1 0x00 REVERT)
		// let revert_bytecode = vec![0x60, 0x00, 0x60, 0x00, 0xFD];
		
		let mut accounts = BTreeMap::<H160, GenesisAccount>::new();
		accounts.insert(
			alice(),
			GenesisAccount {
				nonce: U256::from("1"),
				balance: U256::from(INITIAL_BALANCE),
				// storage: BTreeMap::new(),
				storage: Default::default(),
				// code: revert_bytecode.clone(),
				code: vec![
					0x00, // STOP
				]
			},
		);
        
		GenesisBuild::<Test>::assimilate_storage(
			&pallet_evm::GenesisConfig {
				accounts
			}, 
			&mut t
		).unwrap();

        let mut ext = sp_io::TestExternalities::new(t);
        ext.execute_with(|| System::set_block_number(1));
        ext
    }
}
